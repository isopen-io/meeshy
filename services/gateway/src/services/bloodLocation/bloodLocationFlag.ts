/**
 * LE DRAPEAU de la position du Sang (#13937) : ÉTEINT par défaut, allumé seulement pour la liste
 * blanche des comptes de test. La passerelle n'avait aucun système de drapeau (des `ENABLE_*` lus
 * d'un bloc) ; celui-ci en est la forme minimale — deux variables d'environnement :
 *
 * - `BLOOD_LOCATION_ENABLED=true` allume le drapeau ;
 * - `BLOOD_LOCATION_ALLOWLIST` liste les comptes admis (séparés par des virgules), ou `*` pour tous.
 *
 * Allumé SANS liste blanche, il reste éteint : une sortie ouverte à tous ne se fait jamais par oubli.
 * Un drapeau éteint ne laisse répondre aucune route ni aucun événement de la position du Sang.
 */
export type BloodLocationEnv = Readonly<Record<string, string | undefined>>;

export function bloodLocationEnabledFor(userId: string, env: BloodLocationEnv = process.env): boolean {
  if (!userId || env['BLOOD_LOCATION_ENABLED']?.trim().toLowerCase() !== 'true') return false;
  const allowed = (env['BLOOD_LOCATION_ALLOWLIST'] ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
  return allowed.includes('*') || allowed.includes(userId);
}
