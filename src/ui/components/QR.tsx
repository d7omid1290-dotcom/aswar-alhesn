import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
export function QR({ value, size = 140, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: '#0d1a2e', light: '#ffffff' } }).then(setSrc).catch(() => setSrc('')); }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt="رمز QR للانضمام" className={className} style={{ borderRadius: 10 }} /> : <div style={{ width: size, height: size }} />;
}
