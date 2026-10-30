import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import './globals.css';

/**
 * Two typefaces, two jobs, no overlap.
 *
 * Poppins carries the whole interface, display and prose alike. It is a
 * geometric sans — single-storey `a`, near-circular bowls — so it sets wider
 * and rounder than a grotesque at the same size. The type scale in
 * globals.css is sized and tracked against those proportions rather than
 * Inter's; Poppins at Inter's tracking reads cramped.
 *
 * Only three weights are loaded. A geometric family shipped with all nine is
 * a large download for widths nothing in this UI asks for.
 *
 * JetBrains Mono is reserved for values a machine produced — tool names, ids,
 * model chains, similarity scores — so monospace stays a signal rather than a
 * texture.
 *
 * Both are self-hosted (latin subset, from Fontsource, SIL OFL 1.1) rather
 * than pulled through next/font/google: that loader fetches from Google at
 * build time, and a change in the CSS Google serves broke production builds
 * with nothing in this repo having changed.
 */
const poppins = localFont({
  src: [
    { path: './fonts/poppins-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/poppins-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/poppins-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-poppins',
  display: 'swap',
  fallback: ['Segoe UI', 'system-ui', 'sans-serif'],
});

const jetbrains = localFont({
  src: [
    { path: './fonts/jetbrains-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-jetbrains',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
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
      className={`${poppins.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
