import { useMemo } from 'react';

import type { StoryActionRailHandlers } from '@/components/story-action-rail';
import type { StoryPlaybackStory } from '@/lib/stories/playback';

import { openStorySendSheet } from './open-story-send';
import { useSendSheetOpen } from './use-send-sheet-open';

/**
 * **« ENVOYER » DU RAIL D'UNE STORY** (#8884) — la loi du rail déclarait
 * `showsForward` pour toute story et aucun hôte ne remettait de gestionnaire :
 * le bouton n'existait donc pas (loi 4). Il ouvre la feuille d'envoi COMMUNE —
 * une personne, plusieurs, un groupe, ou une publication — avec la story
 * regardée ; le lecteur ne monte jamais sa propre feuille.
 *
 * `sheetOpen` est l'état de la feuille, pour que le lecteur mette la lecture en
 * attente dessous (`useStoryPauseWhile`) : la story n'avance pas pendant qu'on
 * choisit à qui l'envoyer.
 */
export type StorySend = {
  readonly handlers: Pick<StoryActionRailHandlers, 'forward'>;
  readonly sheetOpen: boolean;
};

export function useStorySend(story: StoryPlaybackStory | undefined): StorySend {
  const sheetOpen = useSendSheetOpen();
  const handlers = useMemo<StorySend['handlers']>(() => (story === undefined ? {} : { forward: () => void openStorySendSheet(story) }), [story]);
  return { handlers, sheetOpen };
}
