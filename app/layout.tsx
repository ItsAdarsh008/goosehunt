import type { Metadata, Viewport } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';

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
  themeColor: '#f4efe4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
