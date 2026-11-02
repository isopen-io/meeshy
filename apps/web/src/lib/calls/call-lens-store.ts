import { createStore } from 'zustand/vanilla';

import type { LensSettings } from '@/lib/meeshy-lens/lens-stage';

/** La lens posée sur ma vidéo d'appel (#11994) — lue par le moteur, posée par `call-lens.ts`. Le moteur n'importe que ce fichier. */
export const callLensStore = createStore<{ readonly lens: LensSettings | null }>(() => ({ lens: null }));
