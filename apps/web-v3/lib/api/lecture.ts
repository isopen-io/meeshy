/**
 * LIRE UNE CHARGE DE LA PASSERELLE — les cinq primitives, et leur site UNIQUE.
 *
 * Tout ce qui entre dans la v3 depuis la passerelle traverse une frontière de
 * désérialisation : la charge est `unknown`, et chaque champ se lit sous garde.
 * Ces primitives vivaient dans `lib/api/fil.ts` seul ; dès qu'un second module
 * a eu besoin de lire la MÊME charge — les citations d'un message —, les
 * recopier aurait fabriqué deux façons de juger « une chaîne vide compte-t-elle
 * pour une valeur ? », et c'est exactement la jumelle que la conception
 * interdit.
 *
 * `estProtege` est ici pour la même raison, et elle porte davantage : elle est
 * la LOI qui décide qu'un contenu ne part pas. Elle se lit sur un MESSAGE
 * comme sur un message CITÉ — les trois champs sont indépendants (un message
 * peut être à vue unique sans être flouté, et expirer sans être ni l'un ni
 * l'autre), et un seul suffit à retenir le texte (cycles 124 et 125 du
 * § Prisme).
 */

export const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

export const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

export const nombre = (valeur: unknown): number | null =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;

/** Une date servie sous sa forme ISO, ou telle que `JSON.stringify` l'a rendue depuis un `Date`. */
export const instant = (valeur: unknown): string | null => {
  const brut = chaine(valeur);
  return brut !== null && !Number.isNaN(Date.parse(brut)) ? brut : null;
};

export const estProtege = (brut: Readonly<Record<string, unknown>>): boolean =>
  brut.isViewOnce === true || brut.isBlurred === true || chaine(brut.expiresAt) !== null;
