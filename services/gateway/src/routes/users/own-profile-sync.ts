/**
 * MON PROFIL SE SYNCHRONISE ENTRE MES APPAREILS (#18924) — l'émetteur de
 * `profile:updated`. Le contrat vit dans `@meeshy/shared/types/own-profile-sync`.
 *
 * Deux audiences, deux charges, jamais l'une par l'autre :
 *
 * | événement | audience | charge |
 * |---|---|---|
 * | `user:updated` | les PARTENAIRES (`emitUserUpdatedToPartners`) | le profil PUBLIC, filtré par `publicProfileChanges` |
 * | `profile:updated` | MES appareils (`user:<moi>`) | l'instantané PROPRE : langues, nom, photo, bannière, accent |
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
  profileUpdatedEventDataSchema,
  type OwnProfileSnapshot,
  type ProfileUpdatedEventData,
} from '@meeshy/shared/types/own-profile-sync';

import { servedProfileAccentColor } from '@meeshy/shared/utils/profile-accent';

import { logError } from '../../utils/logger';
import { broadcastToUser } from '../../utils/socket-broadcast';

/**
 * Ce que la ligne écrite doit porter pour composer l'instantané. `profileAccentColor` y est
 * REQUIS (#19201) : une ligne lue sans lui ferait partir `null`, donc effacerait l'accent sur
 * mes autres appareils — le compilateur refuse un `select` qui l'oublie.
 */
export type OwnProfileRow = OwnProfileSnapshot & {
  readonly profileAccentColor: string | null;
  readonly id: string;
  readonly updatedAt: Date;
};

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
      profileAccentColor: servedProfileAccentColor(row.profileAccentColor),
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
