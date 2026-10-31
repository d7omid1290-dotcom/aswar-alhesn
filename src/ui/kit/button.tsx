import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// زر بأسلوب shadcn/ui مع ألوان اللعبة
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium select-none transition-[transform,background-color,box-shadow,opacity] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent [&_svg]:size-[1.1em] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        gold: 'text-[#1d1608] bg-[linear-gradient(180deg,#f3d991_0%,#d8b052_55%,#b38a35_100%)] shadow-[0_1px_0_rgba(255,255,255,0.55)_inset,0_10px_24px_-10px_rgba(168,130,58,0.9)] hover:brightness-[1.06]',
        navy: 'text-[#f3ead2] bg-[linear-gradient(180deg,#203a63,#13243f)] border border-[rgba(226,189,98,0.35)] hover:border-[rgba(226,189,98,0.7)]',
        ghost: 'text-[var(--ink)] hover:bg-[var(--line)]',
        outline: 'border border-[var(--panel-border)] text-[var(--ink)] bg-transparent hover:bg-[var(--line)]',
        danger: 'text-white bg-[linear-gradient(180deg,#d4624a,#a83c2a)] hover:brightness-110',
        success: 'text-white bg-[linear-gradient(180deg,#4fa36a,#2f7a4a)] hover:brightness-110',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-[15px]',
        lg: 'h-12 px-6 text-base',
        xl: 'h-16 px-10 text-xl font-semibold rounded-2xl',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'navy', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';
