import type { StoryPlaybackStory } from '@/lib/stories/playback';

/**
 * **OUVRIR LA FEUILLE D'ENVOI AVEC UNE STORY** (#8884) — la demande (aperçu,
 * adresse canonique) se compose à la demande : `lib/stories/send-request` n'est
 * chargé qu'au premier « Envoyer » ou « Partager », jamais avec le lecteur
 * (`story_reader` tient son plafond). Ouvrir une feuille n'attend aucune
 * activation du geste, contrairement au partage du système (D-48) : l'`import()`
 * est sans risque ici.
 */
export const openStorySendSheet = (story: StoryPlaybackStory): Promise<void> =>
  import('@/lib/stories/send-request').then(({ openStorySend }) => openStorySend(story));
