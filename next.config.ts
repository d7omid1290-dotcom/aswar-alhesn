import type { NextConfig } from 'next';

// STATIC_PREVIEW=1: نسخة معاينة ثابتة (وضع الشاشة الواحدة فقط، بلا واجهات API)
const preview = process.env.STATIC_PREVIEW === '1';

const nextConfig: NextConfig = preview
  ? {
      output: 'export',
      images: { unoptimized: true }, env: { NEXT_PUBLIC_STATIC: '1' },
    }
  : {
      reactStrictMode: true,
      poweredByHeader: false,
      async headers() {
        return [{ source: '/(.*)', headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ] }];
      },
    };

export default nextConfig;
