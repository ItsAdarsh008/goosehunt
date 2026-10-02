import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next, Big_Shoulders } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const display = Big_Shoulders({ subsets: ['latin'], weight: ['600', '800', '900'], variable: '--font-display' });
const body = Atkinson_Hyperlegible_Next({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-body' });
const mono = Atkinson_Hyperlegible_Mono({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-mono' });

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
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
