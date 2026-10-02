import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Goosehunt',
    short_name: 'Goosehunt',
    description: 'Campus manhunt with timed location pings.',
    start_url: '/',
    display: 'standalone',
    background_color: '#E8EDE3',
    theme_color: '#E8EDE3',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
