/**
 * Le `include` que TOUTE surface servant un participant enrichi doit employer —
 * la LISTE comme la route qui change un rang.
 *
 * Extrait de `participants.ts` le 2026-08-29, non par hygiène de taille mais
 * parce que `PATCH …/role` en dépend et vit désormais dans son propre fichier :
 * l'y recopier aurait fabriqué une seconde source de vérité pour la forme d'un
 * participant, et le témoin qui garde ce `select` (« la fabrique partagée sert
 * `role` global, les trois langues et les horodatages de compte, qu'un select
 * court aurait fait retomber sur des valeurs par défaut ») n'en aurait gardé
 * qu'une.
 *
 * `deactivatedAt` n'est pas décoratif : c'est l'entrée que la porte de présence
 * (`resolveForTarget`) exige pour décider si l'état en ligne de cette personne
 * a le droit d'être servi.
 */
export const participantListUserSelect = {
  user: {
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      displayName: true,
      avatar: true,
      role: true,
      isOnline: true,
      lastActiveAt: true,
      systemLanguage: true,
      regionalLanguage: true,
      customDestinationLanguage: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      deactivatedAt: true
    }
  }
} as const;
