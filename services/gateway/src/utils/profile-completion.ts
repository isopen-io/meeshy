/**
 * Taux de complétion du profil (`User.profileCompletionRate`, #3688).
 *
 * Avant ce fichier, le champ n'était écrit que par deux scripts one-shot
 * (`scripts/force-migration.ts`, `scripts/migrate-user-fields.ts`) : il valait
 * `0` (le `@default` du schéma) pour tout compte créé depuis la dernière
 * exécution manuelle, et ne bougeait plus jamais après — l'anneau de
 * complétion iOS (`UserProfileSheet+DetailsTab.swift`) affichait donc un
 * chiffre figé au jour de la dernière migration.
 *
 * Formule INCHANGÉE par rapport aux scripts one-shot (même cinq champs, même
 * pondération égale, même arrondi) — ce fichier ne fait que la rendre VIVANTE
 * en la rappelant à chaque écriture qui touche un des cinq champs, au lieu de
 * la figer à une exécution ponctuelle.
 */
export type ProfileCompletionInput = {
  readonly displayName?: string | null;
  readonly avatar?: string | null;
  readonly bio?: string | null;
  readonly phoneNumber?: string | null;
  readonly email?: string | null;
};

export function calculateProfileCompletionRate(user: ProfileCompletionInput): number {
  const fields = [
    !!user.displayName,
    !!user.avatar,
    !!(user.bio && user.bio.length > 10),
    !!user.phoneNumber,
    !!user.email,
  ];
  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
}
