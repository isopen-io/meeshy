import type { NotificationContentDetail } from '@meeshy/shared/types/notification-content-detail';

import { mapsUrlOf } from '@/lib/view/message-body';

import type { NotificationRecord } from './record';

/**
 * **LE DÉTAIL D'UN CONTENU DANS LA BANNIÈRE WEB** (#8860, jumeau web de #8856 ;
 * miroir de `NotificationMessageDetail` iOS).
 *
 * La passerelle compose DÉJÀ le corps détaillé (`detailedBannerBody` :
 * « 📍 Tour Eiffel », « 👤 Mamadou », « ✉️ Invitation · Équipe », « 🔗 domaine »,
 * « Réponse à votre story · … ») : ce module n'en réécrit aucun mot. Il lit
 * `context.contentDetail` (#8857) pour ce que le texte ne peut pas porter —
 * les GESTES (« Ouvrir la carte », « Rejoindre », « Répondre »), la vignette
 * d'une vidéo, l'effectif d'une invitation, le vocal à écouter.
 *
 * Lecture FAIL-CLOSED : la charge du socket est une frontière de confiance,
 * un champ illisible est retiré, jamais recopié. Aucune requête sortante : la
 * carte est un LIEN (Plans, ou `geo:` sous la coque Android), jamais une tuile.
 */

type Json = Readonly<Record<string, unknown>>;

const objectOf = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function locationOf(raw: unknown): NotificationContentDetail['location'] {
  const place = objectOf(raw);
  const latitude = finite(place?.latitude);
  const longitude = finite(place?.longitude);
  if (place === null || latitude === null || longitude === null) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  return { latitude, longitude, name: text(place.name), address: text(place.address) };
}

function inviteOf(raw: unknown): NotificationContentDetail['invite'] {
  const invite = objectOf(raw);
  const url = text(invite?.url);
  if (invite === null || url === null) return undefined;
  const count = finite(invite.memberCount);
  return { url, conversationTitle: text(invite.conversationTitle), memberCount: count !== null && count > 0 ? Math.round(count) : null };
}

function linkOf(raw: unknown): NotificationContentDetail['link'] {
  const link = objectOf(raw);
  const url = text(link?.url);
  const domain = text(link?.domain);
  return url === null || domain === null ? undefined : { url, domain };
}

const present = <K extends keyof NotificationContentDetail>(key: K, value: NotificationContentDetail[K] | undefined) =>
  value === undefined ? {} : { [key]: value };

export function decodeContentDetail(raw: unknown): NotificationContentDetail | null {
  const source = objectOf(raw);
  if (source === null) return null;
  const contact = objectOf(source.contact);
  const sticker = objectOf(source.sticker);
  const storyReply = objectOf(source.storyReply);
  const detail: NotificationContentDetail = {
    ...present('location', locationOf(source.location)),
    ...present('contact', contact === null ? undefined : { name: text(contact.name) }),
    ...present('invite', inviteOf(source.invite)),
    ...present('link', linkOf(source.link)),
    ...present('sticker', sticker === null ? undefined : { emoji: text(sticker.emoji) }),
    ...present('videoThumbnailUrl', text(source.videoThumbnailUrl) ?? undefined),
    ...present('storyReply', storyReply === null ? undefined : { authorId: text(storyReply.authorId) }),
  };
  return Object.keys(detail).length > 0 ? detail : null;
}

const INVITE_FORMS: ReadonlySet<string> = new Set(['chat', 'join']);
const SHARE_LINK_KEY = /^[A-Za-z0-9_-]{1,100}$/;

const isMeeshyHost = (host: string): boolean => host === 'meeshy.me' || host.endsWith('.meeshy.me');

/**
 * L'écran d'invitation (`/chat/$link`) qu'une adresse d'invitation Meeshy
 * désigne — `https://meeshy.me/chat|join/<clé>` ou `meeshy://chat/<clé>` —,
 * sinon `null`. Même lecture que `inviteKeyOf` côté passerelle : aucune autre
 * origine n'est suivie, la bannière ne devient pas une redirection ouverte.
 */
export function inviteAppPath(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  const meeshyScheme = url.protocol === 'meeshy:';
  const [form, key] = meeshyScheme ? [url.host, segments[0]] : segments;
  const fromMeeshy = meeshyScheme || (url.protocol === 'https:' && isMeeshyHost(url.hostname.toLowerCase()));
  if (!fromMeeshy || form === undefined || !INVITE_FORMS.has(form.toLowerCase()) || key === undefined) return null;
  return SHARE_LINK_KEY.test(key) ? `/chat/${key}` : null;
}

/**
 * LE PARAMÈTRE « écrire » — l'onglet NEUF qu'ouvre « Répondre » depuis une
 * notification système pose le curseur dans le composeur
 * (`composer-focus-intent.ts`). JUMEAU de `COMPOSE_PARAM` dans
 * `public/sw-push.js`.
 */
export const COMPOSE_PARAM = 'ecrire';

/** Les notifications d'un MESSAGE auquel on répond — jumeau de `REPLYABLE_TYPES` (`contentActionPushFields.ts`). */
const REPLYABLE_TYPES: ReadonlySet<string> = new Set(['new_message', 'message_reply', 'reply', 'user_mentioned', 'message_forwarded']);

export type BannerAction =
  | { readonly kind: 'open-map'; readonly href: string }
  | { readonly kind: 'join'; readonly path: string }
  | { readonly kind: 'reply'; readonly path: string };

/** Le fil où l'on répond — la bannière in-app y met le curseur elle-même (`focusComposerWhenReady`). */
export function replyPath(conversationId: string): string {
  return `/c/${encodeURIComponent(conversationId)}`;
}

/**
 * Les gestes de la bannière, dans l'ordre d'iOS (`NotificationDetailCategories`) :
 * l'action du CONTENU d'abord, « Répondre » ensuite.
 */
export function bannerActions(notification: NotificationRecord, options: { readonly platform?: string | undefined } = {}): readonly BannerAction[] {
  const conversationId = notification.context.conversationId;
  if (conversationId === undefined || !REPLYABLE_TYPES.has(notification.type)) return [];
  const detail = notification.context.contentDetail;
  const invitePath = detail?.invite === undefined ? null : inviteAppPath(detail.invite.url);
  const content: readonly BannerAction[] = detail?.location
    ? [{ kind: 'open-map', href: mapsUrlOf(detail.location, options) }]
    : invitePath !== null
      ? [{ kind: 'join', path: invitePath }]
      : [];
  return [...content, { kind: 'reply', path: replyPath(conversationId) }];
}

export type BannerAudio = { readonly url: string; readonly durationMs: number | null };

/** Le vocal que la bannière fait écouter — `null` hors son, et pour un message protégé (retenu au décodage). */
export function bannerAudio(notification: NotificationRecord): BannerAudio | null {
  const { firstAttachmentUrl: url, firstAttachmentMimeType: mimeType, firstAttachmentDurationMs: durationMs } = notification.context;
  if (url === undefined || mimeType === undefined || !mimeType.startsWith('audio/')) return null;
  return { url, durationMs: durationMs ?? null };
}
