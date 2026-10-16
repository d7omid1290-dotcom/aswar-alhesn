'use client';
/** قصاصات احتفال خفيفة بلا مكتبات */
export function burst(count = 100) {
  if (typeof document === 'undefined') return;
  const colors = ['#f2c641', '#c2410c', '#1d4ed8', '#15803d', '#7e22ce', '#be185d'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('i');
    const dur = 2 + Math.random() * 2;
    Object.assign(c.style, {
      position: 'fixed', top: '-14px', left: Math.random() * 100 + 'vw', width: '9px', height: '15px', borderRadius: '2px', zIndex: '90', pointerEvents: 'none',
      background: colors[i % colors.length], transform: `rotate(${Math.random() * 360}deg)`,
    });
    document.body.appendChild(c);
    c.animate([{ transform: c.style.transform, top: '-14px' }, { transform: `rotate(${720 + Math.random() * 360}deg) translateX(${(Math.random() - 0.5) * 120}px)`, top: '105vh' }],
      { duration: dur * 1000, delay: Math.random() * 600, easing: 'cubic-bezier(.3,.6,.6,1)', fill: 'forwards' }).onfinish = () => c.remove();
  }
}
