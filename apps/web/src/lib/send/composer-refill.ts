import { createStore } from 'zustand/vanilla';

import type { PendingAttachment } from './attachments';
import type { SharedPlace } from './shared-place';

/**
 * LE TEXTE QUI N'EST PAS PARTI (#20075) — un envoi redirigé qui échoue
 * (`withheld-send-run.ts`) le pose ici pour la conversation d'où il partait ;
 * texte, pièces et lieu ; le composeur de cette conversation le reprend (`useComposerAccess`,
 * `Composer.refill`) et l'efface.
 */
export type ComposerRefillPost = {
  readonly conversationId: string;
  readonly text: string;
  readonly attachments: readonly PendingAttachment[];
  readonly place: SharedPlace | null;
};

export const composerRefills = createStore<{ readonly refill: ComposerRefillPost | null }>(() => ({ refill: null }));

export type ComposerRefill = Omit<ComposerRefillPost, 'conversationId'> & { readonly consume: () => void };
