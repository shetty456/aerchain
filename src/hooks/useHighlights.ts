'use client';

import { useState, useCallback } from 'react';
import type { Highlight, HighlightColor, TextWord } from '@/types';

export function useHighlights() {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [activeColor, setActiveColor] = useState<HighlightColor>('yellow');
  const [history, setHistory] = useState<Highlight[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const commit = useCallback((next: Highlight[]) => {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), next]);
    setHistoryIndex((i) => i + 1);
    setHighlights(next);
  }, [historyIndex]);

  const toggleWord = useCallback((word: TextWord, color: HighlightColor) => {
    setHighlights((cur) => {
      const exists = cur.find((h) => h.wordId === word.id);
      const next = exists
        ? cur.filter((h) => h.wordId !== word.id)
        : [...cur, { id: `hl-${Date.now()}-${word.id}`, wordId: word.id, color }];
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), next]);
      setHistoryIndex((i) => i + 1);
      return next;
    });
  }, [historyIndex]);

  const highlightWords = useCallback((wordsToAdd: TextWord[], color: HighlightColor) => {
    setHighlights((cur) => {
      const existing = new Set(cur.map((h) => h.wordId));
      const additions = wordsToAdd
        .filter((w) => !existing.has(w.id))
        .map((w) => ({ id: `hl-${Date.now()}-${w.id}`, wordId: w.id, color }));
      if (!additions.length) return cur;
      const next = [...cur, ...additions];
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), next]);
      setHistoryIndex((i) => i + 1);
      return next;
    });
  }, [historyIndex]);

  const eraseWords = useCallback((wordsToErase: TextWord[]) => {
    setHighlights((cur) => {
      const ids = new Set(wordsToErase.map((w) => w.id));
      const next = cur.filter((h) => !ids.has(h.wordId));
      if (next.length === cur.length) return cur; // nothing changed
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), next]);
      setHistoryIndex((i) => i + 1);
      return next;
    });
  }, [historyIndex]);

  const undo = useCallback(() => {
    setHistoryIndex((i) => {
      if (i <= 0) return i;
      const prev = i - 1;
      setHistory((h) => { setHighlights(h[prev] ?? []); return h; });
      return prev;
    });
  }, []);

  const clear = useCallback(() => commit([]), [commit]);

  return { highlights, activeColor, setActiveColor, toggleWord, highlightWords, eraseWords, undo, clear, canUndo: historyIndex > 0 };
}
