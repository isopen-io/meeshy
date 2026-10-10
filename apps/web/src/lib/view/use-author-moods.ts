import { createContext, useCallback, useContext, useMemo } from 'react';

import { useStatusMoods } from '@/lib/api/query';
import { moodsByAuthor } from '@/lib/view/story-tray';

export type MoodOf = (authorId: string | undefined) => string | undefined;

const NO_MOOD: MoodOf = () => undefined;

/**
 * **LE MOOD DES PERSONNES DE LA LISTE ET DU FIL** (#9065, recette staging
 * 2026-10-02) — le corpus des humeurs (`?scope=statuses`) n'atteignait que le
 * rail et le Flux : une ligne de direct, l'en-tête et les avatars d'auteurs ne
 * recevaient jamais `mood`, et un pair SANS story n'avait de toute façon pas de
 * groupe où le lire. La requête est celle du rail (même clé, même
 * `staleTime`) : venue de la Lentille, elle est déjà en cache. Un INVITÉ n'a
 * pas de corpus (la passerelle le lui refuse) : rien ne part.
 */
export function useAuthorMoods(viewer: { readonly isAnonymous: boolean }): MoodOf {
  const moods = useStatusMoods({ enabled: !viewer.isAnonymous });
  const byAuthor = useMemo(() => moodsByAuthor(moods.data ?? []), [moods.data]);
  return useCallback((authorId: string | undefined) => (authorId === undefined ? undefined : byAuthor.get(authorId)), [byAuthor]);
}

/** Posé par l'écran de fil, lu par chaque avatar de personne du fil. Hors
 * d'un fil : aucun mood. */
export const AuthorMoodsContext = createContext<MoodOf>(NO_MOOD);

export function useAuthorMood(authorId: string | undefined): string | undefined {
  return useContext(AuthorMoodsContext)(authorId);
}
