import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ImageProvider } from '@/context/ImageContext';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SnapHighlight — Highlight screenshots like a PDF',
  description: 'Upload any screenshot. OCR snaps to word boundaries. Click what matters. Export a clean PNG.',
  openGraph: {
    title: 'SnapHighlight — Highlight screenshots like a PDF',
    description: 'Word-level screenshot highlighter. Free, in-browser, no signup.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} h-full`}>
      <body className="min-h-full flex flex-col">
        <ImageProvider>{children}</ImageProvider>
      </body>
    </html>
  );
}
