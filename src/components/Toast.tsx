'use client';

export default function Toast({ visible, message = 'Exported. Ready to post.' }: { visible: boolean; message?: string }) {
  if (!visible) return null;
  return (
    <div className="animate-toast" style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translate(-50%, 0)',
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '9px 16px',
      borderRadius: 8,
      background: '#1a1a1a',
      color: '#ffffff',
      fontSize: 13,
      fontWeight: 500,
      boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      {message}
    </div>
  );
}
