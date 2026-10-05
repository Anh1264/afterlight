import { motion } from 'framer-motion';
import { createContext, useContext, useEffect, useState } from 'react';

export const W = 1600, H = 900;
const Ctx = createContext(1);
export const useStageScale = () => useContext(Ctx);

/** Fixed 1600x900 stage scaled to fit any window, like a console game. */
export function Stage({ children }: { children: React.ReactNode }) {
  const calc = () => Math.min(window.innerWidth / W, window.innerHeight / H);
  const [s, setS] = useState(calc);
  useEffect(() => {
    const f = () => setS(calc());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return (
    <div className="viewport">
      <motion.div className="stage" style={{ width: W, height: H, x: '-50%', y: '-50%', scale: s }}>
        <Ctx.Provider value={s}>{children}</Ctx.Provider>
      </motion.div>
    </div>
  );
}
