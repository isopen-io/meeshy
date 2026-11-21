/**
 * L'ARBITRAGE DE MON PROFIL SYNCHRONISÉ, ISOLÉ DE `own-profile-sync.ts` (#18924)
 * — les dix champs de l'instantané `profile:updated`, leurs types et la règle
 * « jamais plus ancien » : tout ce qu'un client WEB importe à l'exécution pour
 * appliquer l'événement. `own-profile-sync.ts` porte en plus le schéma `zod`
 * CLASSIQUE que la passerelle valide, et RÉEXPORTE ces symboles : l'importer
 * depuis le web tirait `zod` classique dans le morceau partagé « zod » (8,69 →
 * 18,21 Ko gzip, à chaque démarrage). Même piège, même remède que
 * `game-sync-order.ts` (#10904). Aucun import à l'exécution ici.
 *
 * @see schema.prisma model User (`systemLanguage`, `regionalLanguage`,
 * `customDestinationLanguage`, `displayName`, `firstName`, `lastName`,
 * `username`, `avatar`, `banner`, `profileAccentColor`, `updatedAt`)
 */

/** Les champs de l'instantané, dans l'ordre où le Prisme puis l'affichage les lisent. */
export const OWN_PROFILE_FIELDS = [
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'displayName',
  'firstName',
  'lastName',
  'username',
  'avatar',
  'banner',
  'profileAccentColor',
] as const;

export type OwnProfileField = (typeof OWN_PROFILE_FIELDS)[number];

/**
 * `null` veut dire EFFACÉ, comme sur la ligne : la langue secondaire ou la
 * destination retirées, le nom affiché qui retombe sur « Prénom Nom », la photo
 * ou la bannière ôtées. `systemLanguage`, `firstName`, `lastName` et `username`
 * sont requis en base, donc jamais nuls.
 */
export type OwnProfileSnapshot = {
  readonly systemLanguage: string;
  readonly regionalLanguage: string | null;
  readonly customDestinationLanguage: string | null;
  readonly displayName: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly username: string;
  readonly avatar: string | null;
  readonly banner: string | null;
  /**
   * #19201 — la couleur d'accent de la vitrine, `null` = accent calculé. Absente dans la trame
   * d'un serveur d'avant : une clé ABSENTE ne dit rien de l'accent, et le client garde le sien.
   */
  readonly profileAccentColor?: string | null;
};

export type ProfileUpdatedEventData = {
  readonly userId: string;
  /** `User.updatedAt` de l'écriture, ISO 8601 — le même instant que sert `GET /me`. */
  readonly updatedAt: string;
  readonly profile: OwnProfileSnapshot;
};

/**
 * Un instantané reçu est PÉRIMÉ quand l'instant qu'il porte est STRICTEMENT
 * antérieur à celui du profil que l'appareil tient déjà (une relecture de
 * `GET /me` arrivée après l'écriture, ou un événement plus récent). On n'écarte
 * que ce qu'on PROUVE plus ancien : rien de connu, ou un instant illisible, et
 * l'instantané s'applique. Le même instant s'applique aussi — c'est l'écho de
 * la réponse du `PATCH` sur l'appareil qui l'a fait, identique à ce qu'il tient.
 */
export function ownProfileSnapshotIsStale(knownUpdatedAt: string | null | undefined, incomingUpdatedAt: string): boolean {
  const known = knownUpdatedAt ? Date.parse(knownUpdatedAt) : Number.NaN;
  const incoming = Date.parse(incomingUpdatedAt);
  if (Number.isNaN(known) || Number.isNaN(incoming)) return false;
  return incoming < known;
}
