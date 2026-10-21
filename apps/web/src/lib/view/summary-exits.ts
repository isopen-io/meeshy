import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { ConversationEpisode, FaceRampEntry } from '@/lib/summary/types';

export type ThreadSummaryExits = {
  readonly onReplyToPerson: (entry: FaceRampEntry) => void;
  readonly onOpenEpisode: (episode: ConversationEpisode) => void;
  readonly onResumeThread: () => void;
};

/**
 * LES TROIS SORTIES DU RÉSUMÉ VIVANT (#5695, extrait de `routes/thread.tsx`
 * au lot #7429, découpage sans changer un pixel) — miroir
 * `ConversationView.swift:1527-1547` : visage → script + saut sur la
 * PREMIÈRE preuve + pré-adressage (si la réponse est possible d'ici,
 * `replyable`) ; épisode → script + saut sur son PREMIER
 * message ; « Reprendre le fil » → script + saut sur la cible calculée AU
 * MOMENT du geste. Aucun retour automatique.
 *
 * FABRIQUE PURE, jamais un hook : chaque sortie n'est qu'une composition des
 * quatre primitives que l'hôte lui remet, exactement comme les trois fonctions
 * l'étaient en ligne dans `thread.tsx` — aucune mémoïsation n'est ajoutée ici
 * (il n'y en avait pas non plus avant l'extraction).
 *
 * `resumeTarget` est un THUNK, pas une valeur : `onResumeThread` doit lire
 * `unreadBoundary`/`messages` au moment du TAP, jamais celui de la
 * construction de cet objet (la sémantique de `thread.tsx:573-576`, qui
 * lisait ces deux valeurs de la fermeture COURANTE à chaque rendu).
 */
export function summaryExits(params: {
  readonly selectMode: (mode: ConversationReadingMode) => void;
  readonly requestJump: (messageId: string | null) => void;
  readonly setReplyTarget: (id: string | null) => void;
  /** Répondre à ce message est possible d'ici (#11372, `useMessageMenu.replyableOf`) — sinon le visage mène au message sans le citer. */
  readonly replyable: (messageId: string) => boolean;
  readonly resumeTarget: () => string | null;
}): ThreadSummaryExits {
  const { selectMode, requestJump, setReplyTarget, replyable, resumeTarget } = params;

  return {
    onReplyToPerson: (entry) => {
      const target = entry.evidenceMessageIds[0] ?? null;
      selectMode('script');
      requestJump(target);
      if (target === null || replyable(target)) setReplyTarget(target);
    },
    onOpenEpisode: (episode) => {
      selectMode('script');
      requestJump(episode.messageIds[0] ?? null);
    },
    onResumeThread: () => {
      selectMode('script');
      requestJump(resumeTarget());
    },
  };
}
