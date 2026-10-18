import { useEffect } from 'react';

import { holdMediaSystemBars } from './scheme';

/** Un plein écran sombre tient la barre de la coque en icônes claires tant qu'il est monté (#10917). */
export function useMediaSystemBars(): void {
  useEffect(() => holdMediaSystemBars(), []);
}
