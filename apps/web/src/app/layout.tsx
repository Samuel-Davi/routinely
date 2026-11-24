import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

// Inter (SIL OFL), the category's workhorse UI face. Variable: one file per subset.
const inter = localFont({
  src: [{ path: './fonts/inter-latin.woff2' }, { path: './fonts/inter-latin-ext.woff2' }],
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: { default: 'Routinely', template: '%s · Routinely' },
  description: 'Sua rotina semanal, gerada com IA a partir dos seus compromissos e tarefas.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1014' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set by /theme.js before hydration, so React must not complain about it.
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body>
        <Script src="/theme.js" strategy="beforeInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
