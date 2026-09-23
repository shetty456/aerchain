export interface TextWord {
  id: string;
  lineId: string;
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export type HighlightColor = 'yellow' | 'green' | 'cyan' | 'pink' | 'black';

export interface Highlight {
  id: string;
  wordId: string;
  color: HighlightColor;
}

export type OCRStatus = 'idle' | 'loading' | 'done' | 'error';
