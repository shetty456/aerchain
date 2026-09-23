'use client';

import { useState, useRef, useEffect } from 'react';
import type { HighlightColor } from '@/types';

export type ActiveTool = HighlightColor | 'erase';

const COLORS: { id: HighlightColor; hex: string; label: string }[] = [
  { id: 'yellow', hex: '#FFE500', label: 'Yellow' },
  { id: 'green',  hex: '#BEFF40', label: 'Green'  },
  { id: 'cyan',   hex: '#40E8FF', label: 'Cyan'   },
  { id: 'pink',   hex: '#FFB0D4', label: 'Pink'   },
];

interface ToolbarProps {
  activeTool: ActiveTool;
  onToolChange: (t: ActiveTool) => void;
  activeColor: HighlightColor;
  onColorChange: (c: HighlightColor) => void;
  onUndo: () => void;
  onClear: () => void;
  onExport: () => void;
  canUndo: boolean;
  ocrDone: boolean;
}

/* ── Icons ──────────────────────────────────────────────────────────────── */
const MarkerIcon = ({ hex }: { hex: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="8" width="14" height="8" rx="2" fill={hex} />
    <path d="M17 12 L21 16 L17 20 Z" fill={hex} />
    <rect x="3" y="8" width="4" height="8" rx="1" fill="rgba(0,0,0,0.15)" />
  </svg>
);

const RedactIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="7" width="20" height="10" rx="2" fill="#2c2c2c" />
  </svg>
);

const EraseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20H7L3 16l10-10 7 7-3.5 3.5" />
    <path d="M6.1 10.9 4 13" />
  </svg>
);

const UndoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v6h6" /><path d="M3 13C5.2 7.5 11 4 17 5.3A9 9 0 0 1 21 13" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ChevronDown = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/* ── Divider ─────────────────────────────────────────────────────────────── */
const Divider = () => (
  <div style={{ width: 1, height: 18, background: '#e8e8e5', margin: '0 4px', flexShrink: 0 }} />
);

/* ── Icon-only utility button (Undo, Clear) ──────────────────────────────── */
function UtilBtn({ label, danger, disabled, onClick, children }: {
  label: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      aria-label={label} title={label}
      style={{
        width: 30, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, border: '1px solid transparent',
        background: 'transparent',
        color: danger ? '#e5484d' : '#5a5a5a',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'background 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f3'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

/* ── Color picker popover ────────────────────────────────────────────────── */
function ColorPicker({ activeColor, onChange, onClose }: {
  activeColor: HighlightColor; onChange: (c: HighlightColor) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 42, left: '50%', transform: 'translateX(-50%)',
      background: '#fff', border: '1px solid #e8e8e5', borderRadius: 8,
      padding: '8px 0', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', zIndex: 100, minWidth: 130,
    }}>
      {/* Caret pointing up to the button that opened this */}
      <div style={{
        position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
        borderBottom: '5px solid #e8e8e5',
      }} />
      <div style={{
        position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
        borderBottom: '5px solid #fff',
      }} />

      <p style={{ fontSize: 10, color: '#9b9b9b', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 6px', padding: '0 12px' }}>
        Highlight color
      </p>
      {COLORS.map(({ id, hex, label }) => (
        <button
          key={id}
          onClick={() => { onChange(id); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '6px 12px', border: 'none',
            background: activeColor === id ? '#f7f7f5' : 'transparent',
            cursor: 'pointer', width: '100%', textAlign: 'left',
          }}
          onMouseEnter={e => { if (activeColor !== id) (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f5'; }}
          onMouseLeave={e => { if (activeColor !== id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: hex, flexShrink: 0, boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }} />
          <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: activeColor === id ? 500 : 400 }}>{label}</span>
          {activeColor === id && (
            <svg style={{ marginLeft: 'auto' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Main Toolbar ────────────────────────────────────────────────────────── */
export default function Toolbar({
  activeTool, onToolChange, activeColor, onColorChange,
  onUndo, onClear, onExport, canUndo, ocrDone,
}: ToolbarProps) {
  const [showPicker, setShowPicker] = useState(false);
  const colorHex = COLORS.find(c => c.id === activeColor)?.hex ?? '#FFE500';
  const colorLabel = COLORS.find(c => c.id === activeColor)?.label ?? 'Yellow';

  const isHighlight = activeTool !== 'erase' && activeTool !== 'black';

  // Shared style for the three tool buttons (icon + label, same pill shape)
  function toolBtn(active: boolean): React.CSSProperties {
    return {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 6,
      fontSize: 12, fontWeight: active ? 500 : 400,
      cursor: 'pointer',
      border: active ? '1.5px solid #1a1a1a' : '1px solid #e8e8e5',
      background: active ? '#f0f0ee' : '#ffffff',
      color: '#1a1a1a',
      transition: 'background 0.1s, border-color 0.1s',
      userSelect: 'none' as const,
      flexShrink: 0,
      height: 30,
    };
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '7px 12px',
      borderBottom: '1px solid #e8e8e5',
      background: '#ffffff',
    }}>

      {/* ── Highlight tool — icon + label + ▾ for color picker ──────── */}
      <div style={{ position: 'relative' }}>
        <button
          aria-label={`Highlight — ${colorLabel} (click to change color)`}
          title="Highlight — click arrow to change color"
          style={toolBtn(isHighlight)}
          onClick={() => {
            if (!isHighlight) {
              onToolChange(activeColor); // switch to highlight tool
            }
            setShowPicker(p => !p);
          }}
          onMouseEnter={e => { if (!isHighlight) (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f5'; }}
          onMouseLeave={e => { if (!isHighlight) (e.currentTarget as HTMLButtonElement).style.background = '#ffffff'; }}
        >
          <MarkerIcon hex={colorHex} />
          Highlight
          <span style={{ opacity: 0.5, marginLeft: 1 }}>
            <ChevronDown />
          </span>
        </button>

        {showPicker && (
          <ColorPicker
            activeColor={activeColor}
            onChange={c => { onColorChange(c); onToolChange(c); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>

      {/* ── Redact ─────────────────────────────────────────────────── */}
      <button
        aria-label="Redact — cover words with a solid dark block"
        title="Redact — hide words you don't want visible"
        style={toolBtn(activeTool === 'black')}
        onClick={() => { onToolChange('black'); setShowPicker(false); }}
        onMouseEnter={e => { if (activeTool !== 'black') (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f5'; }}
        onMouseLeave={e => { if (activeTool !== 'black') (e.currentTarget as HTMLButtonElement).style.background = '#ffffff'; }}
      >
        <RedactIcon />
        Redact
      </button>

      {/* ── Erase ──────────────────────────────────────────────────── */}
      <button
        aria-label="Erase — remove highlights by clicking or dragging over them"
        title="Erase highlights"
        style={toolBtn(activeTool === 'erase')}
        onClick={() => { onToolChange('erase'); setShowPicker(false); }}
        onMouseEnter={e => { if (activeTool !== 'erase') (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f5'; }}
        onMouseLeave={e => { if (activeTool !== 'erase') (e.currentTarget as HTMLButtonElement).style.background = '#ffffff'; }}
      >
        <EraseIcon />
        Erase
      </button>

      <Divider />

      {/* ── Utilities — icon-only, universally understood ───────────── */}
      <UtilBtn label="Undo last action" disabled={!canUndo} onClick={onUndo}>
        <UndoIcon />
      </UtilBtn>

      <UtilBtn label="Clear all highlights and redactions" danger onClick={onClear}>
        <TrashIcon />
      </UtilBtn>

      {/* ── Export — rightmost, text+icon to remove any ambiguity ───── */}
      <button
        onClick={onExport}
        disabled={!ocrDone}
        aria-label="Export as PNG — downloads the image with your highlights"
        title="Export PNG"
        style={{
          marginLeft: 'auto',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 14px', height: 30, borderRadius: 6,
          fontSize: 12, fontWeight: 600,
          cursor: ocrDone ? 'pointer' : 'not-allowed',
          border: 'none',
          background: ocrDone ? '#1a1a1a' : '#f0f0ee',
          color: ocrDone ? '#ffffff' : '#9b9b9b',
          transition: 'background 0.1s',
          flexShrink: 0,
        }}
        onMouseEnter={e => { if (ocrDone) (e.currentTarget as HTMLButtonElement).style.background = '#2d2d2d'; }}
        onMouseLeave={e => { if (ocrDone) (e.currentTarget as HTMLButtonElement).style.background = '#1a1a1a'; }}
      >
        <DownloadIcon /> Export PNG
      </button>

    </div>
  );
}
