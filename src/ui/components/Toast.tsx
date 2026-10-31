import { AnimatePresence, motion } from 'motion/react';
export function Toast({ msg }: { msg: { text: string; tone: 'error' | 'info'; id: number } | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
      <AnimatePresence>
        {msg && (
          <motion.div key={msg.id} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${msg.tone === 'error' ? 'bg-[#7a2a1f] text-white' : 'bg-[#13243f] text-[#f3ead2]'}`}>
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
