/**
 * Un préfixe lu comme un intervalle de chaînes `[préfixe, successeur)`.
 *
 * Sur MongoDB, Prisma traduit `startsWith` en regex `^<valeur>` sans échapper
 * la valeur (#11467) : toute valeur calculée passe par cet intervalle, qui ne
 * lit aucun métacaractère et sert un index comme le ferait le préfixe.
 */
export const prefixRange = (prefix: string): { readonly gte: string; readonly lt: string } => {
  if (prefix.length === 0) throw new Error('prefixRange: un préfixe vide ne borne rien');
  const last = prefix.length - 1;
  return { gte: prefix, lt: `${prefix.slice(0, last)}${String.fromCharCode(prefix.charCodeAt(last) + 1)}` };
};
