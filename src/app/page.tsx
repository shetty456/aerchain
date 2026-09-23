'use client';

import { useRef } from 'react';
import UploadZone from '@/components/UploadZone';

const HOW = [
  {
    n: '01',
    title: 'Upload',
    body: 'Drop any screenshot or paste from clipboard. PNG, JPEG, WEBP — anything works.',
  },
  {
    n: '02',
    title: 'Click to highlight',
    body: 'OCR reads the image silently. Hover any word to preview. Click to snap. Drag to select a range.',
  },
  {
    n: '03',
    title: 'Export',
    body: 'Download a clean PNG at full resolution. Ready to post — no watermark, no account.',
  },
];

const WHY = [
  {
    title: 'Snaps to words, not your hand.',
    body: 'Every other free tool gives you a freehand brush. The result is wobbly and looks rushed. SnapHighlight reads the text layer with OCR and locks highlights to exact word boundaries.',
  },
  {
    title: 'Runs entirely in your browser.',
    body: 'No server sees your images. No account needed. The OCR engine and canvas renderer are downloaded once and run locally — your screenshots stay private.',
  },
  {
    title: 'Exports at original resolution.',
    body: 'The download is pixel-for-pixel your original screenshot with highlights baked in. No compression, no upscaling artifacts.',
  },
];

export default function HomePage() {
  const toolRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#fff' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b flex items-center justify-between px-6 py-4"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderColor: '#e8e8e5' }}>
        <span className="text-sm font-semibold tracking-tight" style={{ color: '#1a1a1a' }}>
          SnapHighlight
        </span>
        <nav className="flex items-center gap-6">
          <a href="#how" className="text-sm" style={{ color: '#6b6b6b' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#1a1a1a')}
            onMouseLeave={e => (e.currentTarget.style.color = '#6b6b6b')}>
            How it works
          </a>
          <button
            onClick={() => toolRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{ background: '#1a1a1a', color: '#fff', borderRadius: 8 }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#2d2d2d')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '#1a1a1a')}>
            Try it now
          </button>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center text-center px-6 pt-20 pb-16">

        <span className="animate-fade-up inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full mb-8"
          style={{ background: '#f7f7f5', color: '#6b6b6b', border: '1px solid #e8e8e5' }}>
          Free · In-browser · No signup
        </span>

        <h1 className="animate-fade-up-delay-1 font-bold leading-none tracking-tight mb-5"
          style={{ fontSize: 'clamp(36px, 6vw, 60px)', color: '#1a1a1a', letterSpacing: '-0.025em', maxWidth: 640 }}>
          Highlight screenshots.<br />Like&nbsp;a&nbsp;PDF.
        </h1>

        <p className="animate-fade-up-delay-2 mb-12 leading-relaxed"
          style={{ fontSize: 17, color: '#6b6b6b', maxWidth: 480 }}>
          OCR reads your screenshot and snaps highlights to exact word
          boundaries — no more wobbly brush strokes.
        </p>

        {/* Upload zone — the dominant element per Steve Krug */}
        <div ref={toolRef} className="animate-fade-up-delay-3 w-full" style={{ maxWidth: 560 }}>
          <UploadZone />
        </div>

        <p className="mt-5 text-xs" style={{ color: '#9b9b9b' }}>
          Your images never leave your device.
        </p>
      </section>

      {/* ── Divider ────────────────────────────────────────────────────── */}
      <div className="mx-auto w-full" style={{ maxWidth: 560, height: 1, background: '#e8e8e5' }} />

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how" className="px-6 py-20 flex flex-col items-center">
        <p className="text-xs font-semibold uppercase tracking-widest mb-12"
          style={{ color: '#9b9b9b', letterSpacing: '0.1em' }}>
          How it works
        </p>
        <div className="grid gap-10 w-full" style={{ maxWidth: 720, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {HOW.map((step) => (
            <div key={step.n} className="flex flex-col gap-3">
              <span className="font-mono text-xs font-medium" style={{ color: '#9b9b9b' }}>{step.n}</span>
              <h3 className="font-semibold" style={{ fontSize: 15, color: '#1a1a1a' }}>{step.title}</h3>
              <p className="leading-relaxed" style={{ fontSize: 14, color: '#6b6b6b' }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why ────────────────────────────────────────────────────────── */}
      <section className="px-6 pb-24 flex flex-col items-center" style={{ background: '#f7f7f5' }}>
        <div className="w-full py-20" style={{ maxWidth: 720 }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-12"
            style={{ color: '#9b9b9b', letterSpacing: '0.1em' }}>
            Why SnapHighlight
          </p>
          <div className="flex flex-col gap-0">
            {WHY.map((item, i) => (
              <div key={i} className="py-8 flex flex-col gap-2"
                style={{ borderTop: '1px solid #e8e8e5' }}>
                <h3 className="font-semibold" style={{ fontSize: 15, color: '#1a1a1a' }}>{item.title}</h3>
                <p className="leading-relaxed" style={{ fontSize: 14, color: '#6b6b6b', maxWidth: 520 }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Second CTA ─────────────────────────────────────────────────── */}
      <section className="px-6 py-24 flex flex-col items-center text-center">
        <h2 className="font-semibold mb-3 tracking-tight"
          style={{ fontSize: 24, color: '#1a1a1a', letterSpacing: '-0.015em' }}>
          Ready to try it?
        </h2>
        <p className="mb-10 text-sm" style={{ color: '#6b6b6b' }}>
          No account. No install. Just drop a screenshot.
        </p>
        <div className="w-full" style={{ maxWidth: 560 }}>
          <UploadZone />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t mt-auto px-6 py-6 flex items-center justify-between"
        style={{ borderColor: '#e8e8e5' }}>
        <span className="text-xs" style={{ color: '#9b9b9b' }}>SnapHighlight</span>
        <span className="text-xs" style={{ color: '#9b9b9b' }}>Free forever · No account needed</span>
      </footer>

    </div>
  );
}
