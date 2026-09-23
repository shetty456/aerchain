'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useImage } from '@/context/ImageContext';

const EditorCanvas = dynamic(() => import('@/components/EditorCanvas'), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9b9b9b', fontSize: 14 }}>
      Loading canvas…
    </div>
  ),
});

export default function EditorPage() {
  const { imageDataURL, imageDimensions, clearImage } = useImage();
  const router = useRouter();

  useEffect(() => {
    if (!imageDataURL) router.replace('/');
  }, [imageDataURL, router]);

  if (!imageDataURL || !imageDimensions) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <p style={{ fontSize: 13, color: '#9b9b9b' }}>Redirecting…</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>

      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        height: 46,
        borderBottom: '1px solid #e8e8e5',
        background: '#fff',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>SnapHighlight</span>

        <button
          onClick={() => { clearImage(); router.push('/'); }}
          style={{
            marginLeft: 'auto',
            fontSize: 13,
            color: '#6b6b6b',
            background: 'none',
            border: '1px solid #e8e8e5',
            borderRadius: 6,
            padding: '4px 12px',
            cursor: 'pointer',
            transition: 'color 0.1s, border-color 0.1s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.color = '#1a1a1a';
            el.style.borderColor = '#9b9b9b';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.color = '#6b6b6b';
            el.style.borderColor = '#e8e8e5';
          }}
        >
          ← New image
        </button>
      </header>

      {/* Canvas area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <EditorCanvas
          imageDataURL={imageDataURL}
          origW={imageDimensions.width}
          origH={imageDimensions.height}
        />
      </div>

    </div>
  );
}
