import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

/**
 * LA SECTION QUE L'ADRESSE DÉSIGNE (#9539, #9563) — `?section=missions` : le toucher de l'annonce d'une mission
 * personnelle ouvre la FICHE des missions (`/me/progression/concept/missions`). Une liste FERMÉE : une valeur
 * inconnue ne désigne aucune fiche, jamais une adresse bâtie sur une chaîne d'adresse.
 */
const SECTIONS: Readonly<Record<string, ProgressionConcept>> = { missions: 'missions' };

export const progressionSection = (value: string | null): ProgressionConcept | undefined =>
  value === null || !Object.hasOwn(SECTIONS, value) ? undefined : SECTIONS[value];
