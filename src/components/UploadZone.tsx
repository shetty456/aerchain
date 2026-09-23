'use client';

import { useCallback, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useImage } from '@/context/ImageContext';

export default function UploadZone() {
  const { setImage } = useImage();
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload a PNG, JPEG, or WEBP image.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataURL = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImage(dataURL, img.naturalWidth, img.naturalHeight);
        router.push('/editor');
      };
      img.src = dataURL;
    };
    reader.readAsDataURL(file);
  }, [setImage, router]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        width: '100%',
        height: 200,
        borderRadius: 10,
        border: `1.5px dashed ${dragging ? '#1a1a1a' : '#c9c9c5'}`,
        background: dragging ? '#f7f7f5' : '#ffffff',
        cursor: 'pointer',
        outline: 'none',
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
        userSelect: 'none',
      }}
      onMouseEnter={e => {
        if (!dragging) (e.currentTarget as HTMLDivElement).style.borderColor = '#9b9b9b';
      }}
      onMouseLeave={e => {
        if (!dragging) (e.currentTarget as HTMLDivElement).style.borderColor = '#c9c9c5';
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
        {/* Arrow-up icon — clean, no library dependency */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={dragging ? '#1a1a1a' : '#9b9b9b'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>

        <p style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', margin: 0 }}>
          {dragging ? 'Drop to upload' : 'Drop a screenshot here'}
        </p>
        <p style={{ fontSize: 13, color: '#9b9b9b', margin: 0 }}>
          or click to browse &nbsp;·&nbsp; ⌘V to paste
        </p>
      </div>

      {error && (
        <p style={{ position: 'absolute', bottom: 14, fontSize: 12, color: '#e5484d', fontWeight: 500 }}>
          {error}
        </p>
      )}
    </div>
  );
}
