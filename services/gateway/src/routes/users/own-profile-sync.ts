/**
 * MON PROFIL SE SYNCHRONISE ENTRE MES APPAREILS (#18924) — l'émetteur de
 * `profile:updated`. Le contrat vit dans `@meeshy/shared/types/own-profile-sync`.
 *
 * Deux audiences, deux charges, jamais l'une par l'autre :
 *
 * | événement | audience | charge |
 * |---|---|---|
 * | `user:updated` | les PARTENAIRES (`emitUserUpdatedToPartners`) | le profil PUBLIC, filtré par `publicProfileChanges` |
 * | `profile:updated` | MES appareils (`user:<moi>`) | l'instantané PROPRE : langues, nom, photo, bannière |
 *
 * La charge propre se compose ICI, champ par champ, depuis la ligne écrite :
 * un appelant qui passerait la ligne `User` entière (`email`, `phoneNumber`,
 * `password`, `isOnline`…) ne fait rien partir de plus. Elle passe par le
 * schéma du contrat AVANT de partir : une ligne qui ne le satisfait pas (sans
 * instant d'écriture, par exemple) ne diffuse rien — on n'invente pas l'instant
 * sur lequel les clients arbitrent.
 */
import type { FastifyInstance } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  OWN_PROFILE_FIELDS,
  profileUpdatedEventDataSchema,
  type OwnProfileField,
  type OwnProfileSnapshot,
  type ProfileUpdatedEventData,
} from '@meeshy/shared/types/own-profile-sync';

import { logError } from '../../utils/logger';
import { broadcastToUser } from '../../utils/socket-broadcast';

/** Ce que la ligne écrite doit porter pour composer l'instantané. */
export type OwnProfileRow = OwnProfileSnapshot & {
  readonly id: string;
  readonly updatedAt: Date;
};

/**
 * Les colonnes de l'instantané, pour une lecture qui doit le COMPARER avant
 * d'écrire. `satisfies` tient la liste égale à `OWN_PROFILE_FIELDS` : un champ
 * ajouté au contrat ne compile plus tant que la lecture ne le demande pas.
 */
export const OWN_PROFILE_SELECT = {
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
  displayName: true,
  firstName: true,
  lastName: true,
  username: true,
  avatar: true,
  banner: true,
} as const satisfies Record<OwnProfileField, true>;

type OwnProfileColumns = { readonly [Field in OwnProfileField]?: string | null };

/**
 * L'écriture a-t-elle CHANGÉ l'instantané ? La ligne écrite comparée à la ligne
 * lue avant l'écriture, sur les neuf champs — un champ absent vaut `null`, comme
 * dans la charge. Un champ PRÉSENT dans le corps n'en est pas un : l'iOS publié
 * renvoie prénom, nom et nom affiché inchangés à chaque enregistrement (#13825),
 * et une langue se réécrit à l'identique. Sans ligne lue avant, rien ne prouve un
 * changement : rien ne part.
 */
export function ownProfileSnapshotChanged(before: OwnProfileColumns | null | undefined, after: OwnProfileColumns): boolean {
  if (!before) return false;
  return OWN_PROFILE_FIELDS.some((field) => (before[field] ?? null) !== (after[field] ?? null));
}

const PUBLIC_NAME_FIELDS = ['displayName', 'firstName', 'lastName', 'username'] as const satisfies readonly OwnProfileField[];

/**
 * Un des quatre composants du nom a-t-il CHANGÉ entre la ligne lue avant
 * l'écriture et la ligne écrite ? Même règle que `ownProfileSnapshotChanged`
 * (#19298) : sans ligne lue avant, rien ne prouve un changement.
 */
export function publicNameChanged(before: OwnProfileColumns | null | undefined, after: OwnProfileColumns): boolean {
  if (!before) return false;
  return PUBLIC_NAME_FIELDS.some((field) => (before[field] ?? null) !== (after[field] ?? null));
}

/** Une image d'identité (avatar, bannière) a-t-elle CHANGÉ par rapport à la valeur stockée ? */
export function identityImageChanged(before: string | null | undefined, after: string | null | undefined): boolean {
  return (before ?? null) !== (after ?? null);
}

/** L'instantané servi à mes appareils, ou `null` quand la ligne ne permet pas de le composer selon le contrat. */
export function ownProfileUpdatedPayload(row: OwnProfileRow): ProfileUpdatedEventData | null {
  const parsed = profileUpdatedEventDataSchema.safeParse({
    userId: row.id,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    profile: {
      systemLanguage: row.systemLanguage,
      regionalLanguage: row.regionalLanguage ?? null,
      customDestinationLanguage: row.customDestinationLanguage ?? null,
      displayName: row.displayName ?? null,
      firstName: row.firstName,
      lastName: row.lastName,
      username: row.username,
      avatar: row.avatar ?? null,
      banner: row.banner ?? null,
    },
  });
  return parsed.success ? parsed.data : null;
}

/**
 * La diffusion vers mes autres appareils, après une écriture qui A EU LIEU.
 * Canal latéral : RIEN ici ne lève. Socket.IO absent ou émission en échec ⇒ un
 * avertissement de `broadcastToUser` ; une ligne hors contrat ⇒ une ligne
 * d'erreur, rien d'envoyé ; et toute autre levée est avalée, parce qu'une
 * écriture faite ne se rapporte JAMAIS comme un échec — le client rejouerait un
 * geste qui a déjà pris effet. L'appareil qui a écrit reçoit aussi l'écho :
 * c'est l'instantané qu'il tient déjà, que `ownProfileSnapshotIsStale` laisse
 * passer sans effet.
 */
export function announceOwnProfileUpdated(fastify: FastifyInstance, row: OwnProfileRow): boolean {
  try {
    const payload = ownProfileUpdatedPayload(row);
    if (payload === null) {
      logError(fastify.log, `[PROFILE_SYNC] row does not satisfy the profile:updated contract, nothing sent (userId=${row.id})`);
      return false;
    }
    return broadcastToUser(fastify, row.id, SERVER_EVENTS.PROFILE_UPDATED, payload);
  } catch {
    return false;
  }
}
