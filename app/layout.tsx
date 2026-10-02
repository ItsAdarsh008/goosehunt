import type { Metadata, Viewport } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';

// Fonts load from Google Fonts at runtime rather than through next/font, so the build never
// depends on downloading font files. Family names match the --font-* tokens in globals.css.
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@500;700&family=Atkinson+Hyperlegible+Next:wght@400;600;700&family=Big+Shoulders:wght@600;800;900&display=swap';

export const metadata: Metadata = {
  title: 'Goosehunt',
  description: 'Campus manhunt. Every few minutes, the hiders light up on the seekers’ map.',
  applicationName: 'Goosehunt',
  appleWebApp: { capable: true, title: 'Goosehunt', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/pwa-icon/192', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/pwa-icon/180', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#E8EDE3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS_URL} />
      </head>
      <body>{children}</body>
    </html>
  );
}
