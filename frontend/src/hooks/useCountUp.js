import { useState, useEffect, useRef } from "react";

/**
 * useCountUp — animasi angka dari 0 → target saat value berubah.
 * Duration default 800ms, easing ease-out.
 */
export default function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (target === undefined || target === null) return;
    const num = Number(target);
    if (isNaN(num)) { setValue(target); return; }

    // mulai dari nilai sekarang, animasi ke target
    fromRef.current = value;
    startRef.current = null;

    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(fromRef.current + (num - fromRef.current) * eased);
      setValue(current);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}
