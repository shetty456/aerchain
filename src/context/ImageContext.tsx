'use client';

import { createContext, useContext, useState } from 'react';

interface ImageContextType {
  imageDataURL: string | null;
  imageDimensions: { width: number; height: number } | null;
  setImage: (dataURL: string, width: number, height: number) => void;
  clearImage: () => void;
}

const ImageContext = createContext<ImageContextType | undefined>(undefined);

export function ImageProvider({ children }: { children: React.ReactNode }) {
  const [imageDataURL, setImageDataURL] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  function setImage(dataURL: string, width: number, height: number) {
    setImageDataURL(dataURL);
    setImageDimensions({ width, height });
  }

  function clearImage() {
    setImageDataURL(null);
    setImageDimensions(null);
  }

  return (
    <ImageContext.Provider value={{ imageDataURL, imageDimensions, setImage, clearImage }}>
      {children}
    </ImageContext.Provider>
  );
}

export function useImage() {
  const ctx = useContext(ImageContext);
  if (!ctx) throw new Error('useImage must be used within ImageProvider');
  return ctx;
}
