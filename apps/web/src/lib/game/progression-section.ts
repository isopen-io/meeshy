/**
 * LA SECTION QUE L'ADRESSE DÉSIGNE (#9539) — `?section=missions` : le toucher de l'annonce d'une mission
 * personnelle ouvre la Progression à la carte des missions (ancre `game-missions`). Une liste FERMÉE : une
 * valeur inconnue ne fabrique aucune ancre, jamais un `getElementById` sur une chaîne d'adresse.
 */
const SECTIONS: Readonly<Record<string, string>> = { missions: 'game-missions' };

export const progressionSection = (value: string | null): string | undefined =>
  value === null || !Object.hasOwn(SECTIONS, value) ? undefined : SECTIONS[value];
