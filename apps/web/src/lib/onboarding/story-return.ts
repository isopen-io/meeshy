/**
 * LA PREUVE DE RETOUR DU STUDIO (#7729) — `/onboarding?story=<id>` ne crédite
 * l'étape story que si CE client vient de publier cette story. Le studio note
 * l'id que `POST /posts` lui a rendu, l'accueil le consomme à l'arrivée : une
 * adresse tapée ou gardée en favori n'a aucune preuve en mémoire et reprend
 * le parcours normalement, sans « +10 » ni étape marquée faite à tort.
 */
export type StoryReturn = {
  readonly note: (storyId: string) => void;
  readonly take: (storyId: string) => boolean;
};

export function createStoryReturn(): StoryReturn {
  let published: string | null = null;
  return {
    note: (storyId) => {
      published = storyId;
    },
    take: (storyId) => {
      const proven = published !== null && published === storyId;
      published = null;
      return proven;
    },
  };
}

export const storyReturn = createStoryReturn();
