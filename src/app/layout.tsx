import type { Metadata, Viewport } from 'next';
import { Lalezar, Readex_Pro } from 'next/font/google';
import { Toaster } from '@/components/game/toaster';
import { PwaRegister } from '@/components/game/pwa-register';
import './globals.css';

const body = Readex_Pro({ subsets: ['arabic', 'latin'], variable: '--font-body', display: 'swap' });
const title = Lalezar({ subsets: ['arabic', 'latin'], weight: '400', variable: '--font-title', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'أسوار الحصن', template: '%s · أسوار الحصن' },
  description: 'لعبة مسابقات جماعية: وزّع حصنك سرًّا، أجب الأسئلة، واضرب حصون الخصوم.',
  applicationName: 'أسوار الحصن',
  icons: { icon: '/assets/logo.svg', apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: 'أسوار الحصن', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#1d150d' }, { media: '(prefers-color-scheme: light)', color: '#f3e7cf' }],
};

// يضبط الوضع الداكن قبل الرسم لتجنب الوميض
const themeScript = `try{var t=localStorage.getItem('aswar-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className={`${body.variable} ${title.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        {children}
        <Toaster />
        <PwaRegister />
      </body>
    </html>
  );
}
