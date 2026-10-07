import { motion } from 'framer-motion';
import { createContext, useContext, useEffect, useState } from 'react';
import { STAGE_H, STAGE_MIN_W, stageScale, stageWidth } from '../stageSize';

const Ctx = createContext(1);
export const useStageScale = () => useContext(Ctx);

const size = () => ({ w: stageWidth(window.innerWidth, window.innerHeight), s: stageScale(window.innerWidth, window.innerHeight) });

/**
 * 900-high stage scaled to fit any window, like a console game. Its width follows the window (1600 to 2100), so a wide
 * window has no side bands. CSS spreads the screens with `--extra`, the width beyond the 1600 they were designed at.
 */
export function Stage({ children }: { children: React.ReactNode }) {
  const [z, setZ] = useState(size);
  useEffect(() => {
    const f = () => setZ(size());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return (
    <div className="viewport">
      <motion.div className="stage" style={{ width: z.w, height: STAGE_H, x: '-50%', y: '-50%', scale: z.s, ['--extra' as string]: `${z.w - STAGE_MIN_W}px` }}>
        <Ctx.Provider value={z.s}>{children}</Ctx.Provider>
      </motion.div>
    </div>
  );
}
