import { afterEach } from 'bun:test';

import { releaseCaptionReveals } from '@/lib/calls/call-captions-unfold-store';

/**
 * LES PHRASES RÉVÉLÉES D'UN APPEL NE TRAVERSENT PAS LES TÉMOINS (#18596) — le
 * magasin est un singleton de module, et `bun test` joue tous les fichiers dans
 * un seul processus : une phrase `w-1` de l'appel `call-1` dépliée par
 * `call-screen-pill-text.test.tsx` restait dépliée dans
 * `call-captions-panel.test.tsx`, selon l'ordre des fichiers (rouge en CI
 * seulement). Chaque témoin repart de la fin d'un appel : rien de révélé.
 */
afterEach(() => {
  releaseCaptionReveals();
});
