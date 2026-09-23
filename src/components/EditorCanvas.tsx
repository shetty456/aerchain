'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useHighlights } from '@/hooks/useHighlights';
import { useOCR } from '@/hooks/useOCR';
import { useCanvasExport } from '@/hooks/useCanvasExport';
import { computeScale, toOriginalCoords } from '@/lib/scaleCoords';
import OCRLoader from './OCRLoader';
import Toolbar, { type ActiveTool } from './Toolbar';
import Toast from './Toast';
import type { TextWord, HighlightColor } from '@/types';

// #2c2c2c instead of pure black — dark but softer for redaction
const FILL: Record<HighlightColor, string> = {
  yellow: '#FFE500',
  green:  '#BEFF40',
  cyan:   '#40E8FF',
  pink:   '#FFB0D4',
  black:  '#2c2c2c',
};

// Ghost preview fills — 35% opacity version of each colour
const GHOST_FILL: Record<HighlightColor, string> = {
  yellow: 'rgba(255,229,0,0.35)',
  green:  'rgba(190,255,64,0.40)',
  cyan:   'rgba(64,232,255,0.40)',
  pink:   'rgba(255,176,212,0.45)',
  black:  'rgba(44,44,44,0.50)',
};

const MAX_W = 900;
const MAX_H = 660;
// Uniform padding applied to ALL mark types so heights look consistent
const PAD = 2;

function wordAtPoint(words: TextWord[], px: number, py: number, scale: number) {
  const ox = px / scale, oy = py / scale;
  return words.find(w => ox >= w.bbox.x0 - 3 && ox <= w.bbox.x1 + 3 && oy >= w.bbox.y0 - 3 && oy <= w.bbox.y1 + 3);
}

function wordsInRect(words: TextWord[], rx: number, ry: number, rw: number, rh: number, scale: number) {
  const ox = rx / scale, oy = ry / scale, ow = rw / scale, oh = rh / scale;
  return words.filter(w => w.bbox.x0 < ox + ow && w.bbox.x1 > ox && w.bbox.y0 < oy + oh && w.bbox.y1 > oy);
}

interface MergedRect { key: string; x: number; y: number; width: number; height: number; color: HighlightColor }

function buildMergedRects(ids: Set<string>, colorOf: Map<string, HighlightColor>, words: TextWord[], scale: number): MergedRect[] {
  const byLine = new Map<string, TextWord[]>();
  for (const w of words) {
    if (!ids.has(w.id)) continue;
    if (!byLine.has(w.lineId)) byLine.set(w.lineId, []);
    byLine.get(w.lineId)!.push(w);
  }
  const rects: MergedRect[] = [];
  for (const [lineId, lw] of byLine) {
    lw.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const avgH = lw.reduce((s, w) => s + (w.bbox.y1 - w.bbox.y0), 0) / lw.length;
    const GAP = avgH * 0.8;
    let i = 0;
    while (i < lw.length) {
      let j = i;
      while (j + 1 < lw.length && lw[j + 1].bbox.x0 - lw[j].bbox.x1 < GAP) j++;
      const run = lw.slice(i, j + 1);
      const y0 = Math.min(...run.map(w => w.bbox.y0));
      const y1 = Math.max(...run.map(w => w.bbox.y1));
      rects.push({
        key: `${lineId}-${i}`,
        // Uniform PAD on all sides — same for highlights and redactions
        x: (run[0].bbox.x0 - PAD) * scale,
        y: (y0 - PAD) * scale,
        width:  (run[j].bbox.x1 - run[0].bbox.x0 + PAD * 2) * scale,
        height: (y1 - y0 + PAD * 2) * scale,
        color: colorOf.get(run[0].id) ?? 'yellow',
      });
      i = j + 1;
    }
  }
  return rects;
}

interface Props { imageDataURL: string; origW: number; origH: number }

export default function EditorCanvas({ imageDataURL, origW, origH }: Props) {
  const scale = computeScale({ origW, origH, displayW: MAX_W, displayH: MAX_H });
  const displayW = Math.round(origW * scale);
  const displayH = Math.round(origH * scale);

  const stageRef = useRef<Konva.Stage | null>(null);
  const [htmlImage, setHtmlImage] = useState<HTMLImageElement | null>(null);
  const [hoverWord, setHoverWord] = useState<TextWord | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [activeTool, setActiveTool] = useState<ActiveTool>('yellow');

  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const { words, status, progress, recognize } = useOCR();
  const { highlights, activeColor, setActiveColor, toggleWord, highlightWords, eraseWords, undo, clear, canUndo } = useHighlights();
  const { exportPNG, exported } = useCanvasExport();

  useEffect(() => {
    const img = new Image();
    img.onload = () => setHtmlImage(img);
    img.src = imageDataURL;
    recognize(imageDataURL);
  }, [imageDataURL, recognize]);

  // Keep activeTool and activeColor in sync
  const handleToolChange = useCallback((tool: ActiveTool) => {
    setActiveTool(tool);
    if (tool !== 'erase') setActiveColor(tool as HighlightColor);
  }, [setActiveColor]);

  const isErase = activeTool === 'erase';
  const highlightedIds = new Set(highlights.map(h => h.wordId));
  const colorOf = new Map(highlights.map(h => [h.wordId, h.color]));

  const onMouseDown = useCallback((_e: KonvaEventObject<MouseEvent>) => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    isDragging.current = true;
    dragStart.current = pos;
    setDragRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
  }, []);

  const onMouseMove = useCallback((_e: KonvaEventObject<MouseEvent>) => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    if (!isDragging.current || !dragStart.current) {
      const w = wordAtPoint(words, pos.x, pos.y, scale);
      setHoverWord(w ?? null);
      if (isErase) {
        setCursorStyle(w && highlightedIds.has(w.id) ? 'pointer' : 'default');
      } else {
        setCursorStyle(w ? 'text' : 'default');
      }
      return;
    }
    const { x: sx, y: sy } = dragStart.current;
    setDragRect({ x: Math.min(sx, pos.x), y: Math.min(sy, pos.y), width: Math.abs(pos.x - sx), height: Math.abs(pos.y - sy) });
    setHoverWord(null);
    setCursorStyle('crosshair');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, scale, isErase, highlightedIds]);

  const onMouseUp = useCallback((_e: KonvaEventObject<MouseEvent>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const pos = stageRef.current?.getPointerPosition();
    const wasDrag = dragRect && (dragRect.width > 6 || dragRect.height > 6);

    if (isErase) {
      const targets = wasDrag && dragRect
        ? wordsInRect(words, dragRect.x, dragRect.y, dragRect.width, dragRect.height, scale)
        : pos ? [wordAtPoint(words, pos.x, pos.y, scale)].filter(Boolean) as TextWord[] : [];
      if (targets.length) eraseWords(targets);
    } else {
      if (wasDrag && dragRect) {
        const hit = wordsInRect(words, dragRect.x, dragRect.y, dragRect.width, dragRect.height, scale);
        if (hit.length) highlightWords(hit, activeColor);
      } else if (pos) {
        const hit = wordAtPoint(words, pos.x, pos.y, scale);
        if (hit) toggleWord(hit, activeColor);
      }
    }
    dragStart.current = null;
    setDragRect(null);
    setCursorStyle('default');
  }, [dragRect, words, scale, isErase, eraseWords, highlightWords, toggleWord, activeColor]);

  const mergedRects = buildMergedRects(highlightedIds, colorOf, words, scale);

  // Words to show ghost preview for
  const ghostWords: TextWord[] = dragRect
    ? wordsInRect(words, dragRect.x, dragRect.y, dragRect.width, dragRect.height, scale)
    : hoverWord ? [hoverWord] : [];

  // Hint line copy
  const hint = isErase
    ? 'Click a highlighted word to remove it · drag to erase a range'
    : activeColor === 'black'
    ? 'Click a word to cover it · drag for a range · click again to uncover'
    : 'Click a word to highlight · drag for a range · click again to remove';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        activeColor={activeColor}
        onColorChange={(c) => { setActiveColor(c); handleToolChange(c); }}
        onUndo={undo}
        onClear={clear}
        onExport={() => exportPNG(stageRef, origW, displayW)}
        canUndo={canUndo}
        ocrDone={status === 'done'}
      />

      {status === 'loading' && <OCRLoader progress={progress} />}

      {status === 'error' && (
        <div style={{ padding: '7px 16px', fontSize: 12, color: '#e5484d', borderBottom: '1px solid #e8e8e5' }}>
          Couldn&apos;t detect text — try a screenshot with a light background and clear text.
        </div>
      )}

      {status === 'done' && (
        <div style={{
          padding: '7px 16px', fontSize: 12, color: '#6b6b6b',
          borderBottom: '1px solid #e8e8e5', background: '#fafafa',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {/* Coloured left border matches active tool so hint feels contextual */}
          <span style={{
            display: 'inline-block', width: 3, height: 14, borderRadius: 2, flexShrink: 0,
            background: isErase ? '#e5484d' : activeColor === 'black' ? '#2c2c2c' : FILL[activeColor],
          }} />
          {hint}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f7f7f5' }}>
        <Stage
          ref={stageRef}
          width={displayW}
          height={displayH}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          style={{ cursor: status === 'done' ? cursorStyle : 'default', borderRadius: 10, overflow: 'hidden', boxShadow: '0 6px 32px rgba(0,0,0,0.18)' }}
        >
          {/* Layer 1: image + marks — same layer so multiply composites against image pixels */}
          <Layer>
            {htmlImage && <KonvaImage image={htmlImage} width={displayW} height={displayH} listening={false} />}
            {mergedRects.map(r => {
              const isRedact = r.color === 'black';
              return (
                <Rect
                  key={r.key}
                  x={r.x} y={r.y} width={r.width} height={r.height}
                  fill={FILL[r.color]}
                  globalCompositeOperation={isRedact ? 'source-over' : 'multiply'}
                  cornerRadius={3}
                  listening={false}
                />
              );
            })}
          </Layer>

          {/* Layer 2: ghost previews */}
          <Layer listening={false}>
            {ghostWords.map(w => {
              const isHighlighted = highlightedIds.has(w.id);
              // Erase mode: show a red removal indicator over highlighted words only
              if (isErase) {
                if (!isHighlighted) return null;
                return (
                  <Rect
                    key={`ghost-${w.id}`}
                    x={(w.bbox.x0 - PAD) * scale} y={(w.bbox.y0 - PAD) * scale}
                    width={(w.bbox.x1 - w.bbox.x0 + PAD * 2) * scale}
                    height={(w.bbox.y1 - w.bbox.y0 + PAD * 2) * scale}
                    fill="rgba(229,72,61,0.25)"
                    stroke="#e5484d" strokeWidth={1}
                    cornerRadius={3}
                  />
                );
              }
              // Highlight/redact mode: show ghost only on words not yet marked
              if (isHighlighted) return null;
              return (
                <Rect
                  key={`ghost-${w.id}`}
                  x={(w.bbox.x0 - PAD) * scale} y={(w.bbox.y0 - PAD) * scale}
                  width={(w.bbox.x1 - w.bbox.x0 + PAD * 2) * scale}
                  height={(w.bbox.y1 - w.bbox.y0 + PAD * 2) * scale}
                  fill={GHOST_FILL[activeColor]}
                  stroke={activeColor === 'black' ? 'transparent' : 'rgba(0,0,0,0.12)'}
                  strokeWidth={1}
                  cornerRadius={3}
                />
              );
            })}

            {/* Drag selection box */}
            {dragRect && (dragRect.width > 6 || dragRect.height > 6) && (
              <Rect
                x={dragRect.x} y={dragRect.y} width={dragRect.width} height={dragRect.height}
                fill={isErase ? 'rgba(229,72,61,0.06)' : 'rgba(0,0,0,0.04)'}
                stroke={isErase ? '#e5484d' : '#9b9b9b'}
                strokeWidth={1} dash={[4, 3]} cornerRadius={2}
              />
            )}
          </Layer>
        </Stage>
      </div>

      <Toast visible={exported} />
    </div>
  );
}
