import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { crossfadeLayers } from './call-camera-off';

/**
 * Le fondu image ↔ avatar, interruptible : `covered` est l'opacité visée du
 * voile (CSS la transitionne), `settled` n'est rendu qu'une fois le fondu
 * fini. Un changement en plein fondu repart de là où l'opacité en est — rien
 * n'est rejoué ni coupé. La première peinture ne joue rien.
 */
export function useCameraCrossfade(videoOn: boolean, ms: number): { readonly video: boolean; readonly veil: boolean; readonly covered: boolean } {
  const [settled, setSettled] = useState(true);
  const [covered, setCovered] = useState(!videoOn);
  const previous = useRef(videoOn);
  useLayoutEffect(() => {
    if (previous.current === videoOn) return;
    previous.current = videoOn;
    setSettled(false);
  }, [videoOn]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setCovered(!videoOn));
    const done = setTimeout(() => setSettled(true), ms);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [videoOn, ms]);
  return { ...crossfadeLayers({ videoOn, settled }), covered };
}
