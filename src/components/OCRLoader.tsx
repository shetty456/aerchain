'use client';

export default function OCRLoader({ progress }: { progress: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid #e8e8e5' }}>
      <div style={{ width: '100%', maxWidth: 240, height: 2, background: '#e8e8e5', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.max(progress, 3)}%`,
          background: '#1a1a1a',
          borderRadius: 2,
          transition: 'width 0.2s ease',
        }} />
      </div>
      <p style={{ fontSize: 12, color: '#9b9b9b', margin: 0 }}>
        Reading text… {progress}%
      </p>
    </div>
  );
}
