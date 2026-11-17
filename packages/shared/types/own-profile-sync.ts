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
 * par `@meeshy/shared/types/own-profile-sync`. La liste des champs et la règle
 * d'arbitrage vivent dans `own-profile-sync-order.ts`, SANS zod, et sont
 * réexportées ici ; ce module y déclare aussi le contrat en types explicites,
 * que les deux schémas ci-dessous SATISFONT. Un client web importe de là,
 * jamais d'ici (la garde `apps/web/src/lib/no-classic-zod.test.ts` y veille).
 * Les types exportés ICI restent ceux qu'infère zod : la passerelle compile
 * sans `strictNullChecks`, où l'inférence rend optionnels les champs nuls — un
 * type explicite y refuserait `safeParse(…).data`.
 *
 * @see schema.prisma model User (`systemLanguage`, `regionalLanguage`,
 * `customDestinationLanguage`, `displayName`, `firstName`, `lastName`,
 * `username`, `avatar`, `banner`, `updatedAt`)
 */
import { z } from 'zod';

import type {
  OwnProfileSnapshot as OwnProfileSnapshotContract,
  ProfileUpdatedEventData as ProfileUpdatedEventDataContract,
} from './own-profile-sync-order.js';

export { OWN_PROFILE_FIELDS, ownProfileSnapshotIsStale } from './own-profile-sync-order.js';
export type { OwnProfileField } from './own-profile-sync-order.js';

/** Le schéma de l'instantané (`own-profile-sync-order.ts` en déclare le type), que la passerelle valide. */
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
}) satisfies z.ZodType<OwnProfileSnapshotContract>;

export type OwnProfileSnapshot = z.infer<typeof ownProfileSnapshotSchema>;

export const profileUpdatedEventDataSchema = z.object({
  userId: z.string().min(1),
  /** `User.updatedAt` de l'écriture, ISO 8601 — le même instant que sert `GET /me`. */
  updatedAt: z.iso.datetime({ offset: true }),
  profile: ownProfileSnapshotSchema,
}) satisfies z.ZodType<ProfileUpdatedEventDataContract>;

export type ProfileUpdatedEventData = z.infer<typeof profileUpdatedEventDataSchema>;
