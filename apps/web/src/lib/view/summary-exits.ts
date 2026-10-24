import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { ConversationEpisode, FaceRampEntry } from '@/lib/summary/types';

/** Ce que le menu d'une entrée du Résumé offre, dans l'ordre où il l'offre (#11225). */
export type SummaryEntryAction = 'goToMessage' | 'reply';

/**
 * LE MENU D'UNE ENTRÉE DU RÉSUMÉ (#11225) — l'appui long, le clic droit, la
 * touche menu et `Maj+F10` sur un visage ou un épisode. `actionsOf` dit ce qui
 * s'offre pour le message que l'entrée désigne ; `run` l'exécute. « Répondre »
 * n'est offert que si la loi l'admet (`replyable`, celle du menu du message), et
 * `run` la RELIT au moment du choix : un droit retiré entre l'ouverture et le
 * geste ne cite rien.
 */
export type SummaryEntryMenu = {
  readonly actionsOf: (messageId: string) => readonly SummaryEntryAction[];
  readonly run: (action: SummaryEntryAction, messageId: string) => void;
};

export type ThreadSummaryExits = {
  readonly onReplyToPerson: (entry: FaceRampEntry) => void;
  readonly onOpenEpisode: (episode: ConversationEpisode) => void;
  readonly onResumeThread: () => void;
  readonly entryMenu: SummaryEntryMenu;
};

/**
 * LE MESSAGE QU'UNE ENTRÉE DÉSIGNE — celui où son toucher mène : la PREMIÈRE
 * preuve d'un visage, le PREMIER message d'un épisode. Son menu porte sur ce
 * même message, jamais sur un autre : « Aller au message » y mène comme le
 * toucher, « Répondre » le cite. `null` : l'entrée ne désigne rien, et n'a pas
 * de menu.
 */
export const faceTargetOf = (entry: FaceRampEntry): string | null => entry.evidenceMessageIds[0] ?? null;
export const episodeTargetOf = (episode: ConversationEpisode): string | null => episode.messageIds[0] ?? null;

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
  const goTo = (target: string | null) => {
    selectMode('script');
    requestJump(target);
  };

  return {
    onReplyToPerson: (entry) => {
      const target = faceTargetOf(entry);
      goTo(target);
      if (target === null || replyable(target)) setReplyTarget(target);
    },
    onOpenEpisode: (episode) => goTo(episodeTargetOf(episode)),
    onResumeThread: () => goTo(resumeTarget()),
    entryMenu: {
      actionsOf: (messageId) => (replyable(messageId) ? ['goToMessage', 'reply'] : ['goToMessage']),
      run: (action, messageId) => {
        goTo(messageId);
        if (action === 'reply' && replyable(messageId)) setReplyTarget(messageId);
      },
    },
  };
}
