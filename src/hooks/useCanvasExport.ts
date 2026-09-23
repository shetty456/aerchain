'use client';

import { useCallback, useState } from 'react';
import type Konva from 'konva';

export function useCanvasExport() {
  const [exported, setExported] = useState(false);

  const exportPNG = useCallback(
    (stageRef: React.RefObject<Konva.Stage | null>, origW: number, displayW: number) => {
      const stage = stageRef.current;
      if (!stage) return;

      const pixelRatio = origW / displayW;
      const dataURL = stage.toDataURL({ mimeType: 'image/png', quality: 1, pixelRatio });

      const link = document.createElement('a');
      link.download = `snaphighlight-${Date.now()}.png`;
      link.href = dataURL;
      link.click();

      setExported(true);
      setTimeout(() => setExported(false), 2500);
    },
    []
  );

  return { exportPNG, exported };
}
