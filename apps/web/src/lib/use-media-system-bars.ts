import { useEffect } from 'react';

import { holdMediaSystemBars } from './scheme';

/** Un plein écran sombre tient les barres de la coque et du navigateur en sombre tant qu'il est monté (#10917, #10922). */
export function useMediaSystemBars(): void {
  useEffect(() => holdMediaSystemBars(), []);
}
