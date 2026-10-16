import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'أسوار الحصن', short_name: 'أسوار الحصن', lang: 'ar', dir: 'rtl',
    description: 'لعبة مسابقات جماعية بحصون سرية وضربات',
    start_url: '/', display: 'standalone', orientation: 'any',
    background_color: '#1d150d', theme_color: '#1d150d',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/assets/logo.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
