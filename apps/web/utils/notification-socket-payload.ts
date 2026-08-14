/**
 * Décodage du payload `notification:new`.
 *
 * Le contrat est celui que la gateway émet, et lui seul : la structure GROUPÉE
 * produite par `NotificationService.formatNotification()`, enrichie de
 * `title`/`subtitle`. Ces deux derniers sont calculés SERVEUR dans la langue
 * résolue du destinataire et persistés — source unique pour le push, la liste
 * in-app et le web (@see packages/shared/types/notification.ts). Les ignorer
 * fait retomber l'affichage sur un repli client dérivé, dans une autre langue
 * que celle que le serveur a résolue.
 *
 * `state.isRead` / `state.readAt` / `state.createdAt` / `state.expiresAt` sont
 * lus SOUS `state`, jamais à la racine : la forme plate est celle d'avant le
 * regroupement, plus personne ne l'émet. La relire « au cas où » réinstallerait
 * la lecture qui, en dégradant vers des valeurs plausibles au lieu de jeter,
 * a caché le décalage pendant tout ce temps.
 */

import type { Notification } from '@/types/notification';

type RawPayload = Record<string, unknown>;

const isRecord = (value: unknown): value is RawPayload =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export function decodeNotificationSocketPayload(raw: unknown): Notification | null {
  if (!isRecord(raw)) return null;

  const id = raw.id;
  if (typeof id !== 'string' || id.length === 0) return null;

  const state = isRecord(raw.state) ? raw.state : {};

  return {
    id,
    userId: typeof raw.userId === 'string' ? raw.userId : '',
    type: raw.type as Notification['type'],
    priority: (raw.priority as Notification['priority']) || 'normal',

    title: asNullableString(raw.title),
    subtitle: asNullableString(raw.subtitle),
    content: typeof raw.content === 'string' ? raw.content : '',

    actor: raw.actor as Notification['actor'],
    // Le contexte est repris TEL QUEL : il porte une vingtaine de clés
    // (callSessionId, postId, parentCommentId, firstAttachmentUrl…) dont
    // dépendent la navigation et les marqueurs d'expiration. Toute
    // reconstruction sélective en perdrait silencieusement.
    context: (isRecord(raw.context) ? raw.context : {}) as Notification['context'],
    metadata: (isRecord(raw.metadata) ? raw.metadata : {}) as Notification['metadata'],

    state: {
      isRead: state.isRead === true,
      readAt: asDate(state.readAt),
      // Dernier recours, et non cas nominal : une notification qui ARRIVE a
      // bien été créée à l'instant, mais l'heure de l'appareil n'est pas
      // l'heure du serveur — elle décide du regroupement par jour, du « il y a
      // X » et de la clé d'anti-doublon des toasts.
      createdAt: asDate(state.createdAt) ?? new Date(),
      expiresAt: asDate(state.expiresAt) ?? undefined,
    },

    delivery: {
      emailSent: isRecord(raw.delivery) && raw.delivery.emailSent === true,
      pushSent: isRecord(raw.delivery) && raw.delivery.pushSent === true,
    },
  };
}
