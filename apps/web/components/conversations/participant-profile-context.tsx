'use client';

import { createContext, useContext } from 'react';

/**
 * L'ouverture de la fiche d'un participant, mise à disposition de toute la
 * conversation.
 *
 * Un visiteur sans compte n'a pas de page `/u/{pseudo}` : sa fiche est la SEULE
 * surface où son identité existe. Elle doit donc s'ouvrir depuis partout où son
 * nom apparaît — bulle, citation, liste, en-tête — ce qui pose un problème
 * concret : chacune de ces surfaces est une feuille, souvent mémoïsée, et faire
 * porter à chacune son propre état de modale multiplierait autant de dialogues
 * que de noms affichés à l'écran.
 *
 * Le contexte règle les deux : UN dialogue monté au niveau de la conversation
 * (`ParticipantProfileProvider`), et une fonction stable que les feuilles
 * appellent sans rien savoir de lui.
 *
 * Ce module ne connaît PAS le dialogue, et c'est délibéré : les feuilles qui
 * consultent le contexte ne doivent pas tirer React Query ni la modale dans leur
 * bundle — ni dans leurs tests.
 *
 * Hors provider, le hook rend `null` plutôt que de jeter. Ces composants sont
 * montés dans des contextes variés — aperçus, pages de lien, tests — et un nom
 * qui ne s'ouvre pas y reste un nom lisible. Une exception transformerait une
 * dégradation acceptable en écran blanc.
 */
export type OpenParticipantProfile = (participantId: string) => void;

export const ParticipantProfileContext = createContext<OpenParticipantProfile | null>(null);

export function useOpenParticipantProfile(): OpenParticipantProfile | null {
  return useContext(ParticipantProfileContext);
}
