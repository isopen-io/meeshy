/**
 * MON PROFIL SE SYNCHRONISE ENTRE MES APPAREILS (#18924) — changer sa langue,
 * son nom ou sa photo se voit aussitôt sur ses autres appareils.
 *
 * `user:updated` ne pouvait pas le porter : il part vers les rooms des
 * PARTENAIRES et exclut l'auteur, et sa charge est filtrée sur le profil PUBLIC
 * (`publicProfileChanges`) — les langues n'ont pas à y figurer. Un appareil de
 * l'auteur gardait donc son Prisme jusqu'à la prochaine lecture de `GET /me`
 * (jusqu'à 30 min) ou une reconnexion.
 *
 * `profile:updated` est émis sur `user:<auteur>` SEULEMENT, après chaque
 * écriture qui change un des champs ci-dessous (`PATCH /users/me`,
 * `/users/me/avatar`, `/users/me/banner`, `/users/me/username`). Sa charge
 * est l'INSTANTANÉ de ces champs tels que la ligne les porte après l'écriture —
 * pas un delta : un événement perdu est réparé par le suivant, et deux
 * événements reçus dans le désordre s'arbitrent par `updatedAt`
 * (`ownProfileSnapshotIsStale`). Les trois langues voyagent ensemble parce que
 * le Prisme les lit ensemble ; les quatre composants du nom aussi, pour la
 * raison de `UserUpdatedEventData`.
 *
 * Rétrocompatible : un ancien client n'écoute pas cet événement, et rien ne
 * change pour lui ; aucun champ de `user:updated` n'est retiré. Un client lit
 * la charge en tolérant les clés qu'il ne connaît pas (un serveur plus récent
 * peut en ajouter) : ce schéma les ignore.
 *
 * Les schémas zod restent hors du baril (`types/index.ts`) : on les importe
 * par `@meeshy/shared/types/own-profile-sync`.
 *
 * @see schema.prisma model User (`systemLanguage`, `regionalLanguage`,
 * `customDestinationLanguage`, `displayName`, `firstName`, `lastName`,
 * `username`, `avatar`, `banner`, `profileAccentColor`, `updatedAt`)
 */
import { z } from 'zod';

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
export const ownProfileSnapshotSchema = z.object({
  systemLanguage: z.string().min(1),
  regionalLanguage: z.string().nullable(),
  customDestinationLanguage: z.string().nullable(),
  displayName: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  username: z.string(),
  avatar: z.string().nullable(),
  banner: z.string().nullable(),
  /**
   * #19201 — la couleur d'accent de la vitrine (`PROFILE_ACCENT_HEXES`), `null` = accent calculé.
   * OPTIONNELLE pour la trame d'un serveur d'avant : une clé ABSENTE ne dit rien de l'accent, et le
   * client garde le sien ; la passerelle d'aujourd'hui la pose toujours.
   */
  profileAccentColor: z.string().nullable().optional(),
});

export type OwnProfileSnapshot = z.infer<typeof ownProfileSnapshotSchema>;

export const profileUpdatedEventDataSchema = z.object({
  userId: z.string().min(1),
  /** `User.updatedAt` de l'écriture, ISO 8601 — le même instant que sert `GET /me`. */
  updatedAt: z.iso.datetime({ offset: true }),
  profile: ownProfileSnapshotSchema,
});

export type ProfileUpdatedEventData = z.infer<typeof profileUpdatedEventDataSchema>;

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
