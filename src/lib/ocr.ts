import type { TextWord } from '@/types';

type ProgressCallback = (progress: number) => void;

export async function runOCR(
  imageDataURL: string,
  onProgress: ProgressCallback
): Promise<TextWord[]> {
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  const { data } = await worker.recognize(imageDataURL, {}, { blocks: true });
  await worker.terminate();

  const words: TextWord[] = [];
  let wordIdx = 0;

  (data.blocks ?? []).forEach((block, bi) => {
    block.paragraphs.forEach((para, pi) => {
      para.lines.forEach((line, li) => {
        const lineId = `b${bi}-p${pi}-l${li}`;
        line.words
          .filter((w) => w.text.trim().length > 0)
          .forEach((w) => {
            words.push({
              id: `w-${wordIdx++}`,
              lineId,
              text: w.text.trim(),
              bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
            });
          });
      });
    });
  });

  return words;
}
