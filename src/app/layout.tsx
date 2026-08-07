import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';

import './globals.css';

/**
 * Three typefaces, three jobs, no overlap.
 *
 * Inter Tight carries display sizes, where its tighter fit and shorter
 * extenders hold a headline together. Inter carries everything read as
 * prose. JetBrains Mono is reserved for values a machine produced — tool
 * names, ids, model chains, similarity scores — so monospace stays a signal
 * rather than a texture.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Cannon — personal multi-agent assistant',
  description:
    'A multi-agent assistant where each domain gets its own persona, tools and retrieval scope, on one shared production stack.',
  applicationName: 'Cannon',
  authors: [{ name: 'Harshith' }],
  openGraph: {
    title: 'Cannon — personal multi-agent assistant',
    description:
      'Domain-specialised agents with their own tools, prompts and retrieval, built to be used daily.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#08090c' },
    { media: '(prefers-color-scheme: light)', color: '#fbfbfc' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Applied before first paint so a returning light-theme visitor never sees a
 * dark flash. Dark is the product default rather than the system default:
 * Cannon is an instrument panel, and the system preference is about documents.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('cannon-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${interTight.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
