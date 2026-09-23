'use client';

import { useState, useCallback } from 'react';
import { runOCR } from '@/lib/ocr';
import type { TextWord, OCRStatus } from '@/types';

export function useOCR() {
  const [words, setWords] = useState<TextWord[]>([]);
  const [status, setStatus] = useState<OCRStatus>('idle');
  const [progress, setProgress] = useState(0);

  const recognize = useCallback(async (imageDataURL: string) => {
    setStatus('loading');
    setProgress(0);
    setWords([]);
    try {
      const result = await runOCR(imageDataURL, (p) => setProgress(p));
      setWords(result);
      setStatus(result.length === 0 ? 'error' : 'done');
    } catch {
      setStatus('error');
    }
  }, []);

  return { words, status, progress, recognize };
}
