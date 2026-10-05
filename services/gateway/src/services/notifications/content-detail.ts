/**
 * Le DÉTAIL d'un contenu de message dans sa bannière (#8857, sous-lot gateway
 * de #8856) — ce qu'il est, ce que le corps en dit, ce que `data` en porte.
 *
 * Trois projections d'UNE lecture, et c'est ce qui les garde d'accord :
 *  - {@link resolveContentDetail} lit le message (texte, `metadata`, première
 *    pièce jointe) et rend le détail — l'éventail l'appelle UNE fois, et
 *    seulement quand le média a le droit de voyager (`mediaMayTravel`) ;
 *  - {@link detailedBannerBody} en compose le corps servi ;
 *  - {@link contentDetailPushFields} / {@link contentDetailCategory} l'aplatissent
 *    sur le fil push, sous la MÊME retenue que le média inline
 *    (`showPreview`, `notificationLocKey`) — cf. `createNotification`.
 *
 * Aucune requête sortante : un lien web ne dit que son domaine, et l'unique
 * lecture (le lien de partage d'une invitation) est en base.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type {
  NotificationContentCategory,
  NotificationContentDetail,
} from '@meeshy/shared/types/notification-content-detail';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { contactCardNameFromFileName, isContactCardAttachment } from '@meeshy/shared/utils/vcard';
import { sliceCodePoints } from '@meeshy/shared/utils/text-truncate';

import { sharedPlaceFromMetadata } from '../location/sharedPlace';
import { stickerFromMetadata } from '../stickers/messageSticker';
import { publicMediaUrlFromEnv } from '../attachments/publicMediaUrl';

/** Au-delà, une adresse ne tient pas dans le budget APNs à côté du reste — et tronquée, elle ne mène nulle part. */
const MAX_URL_LENGTH = 512;
const MAX_TITLE_LENGTH = 120;
const SHARE_LINK_KEY = /^[A-Za-z0-9_-]{1,100}$/;
const URL_IN_TEXT = /(?:https?|meeshy):\/\/[^\s<>"']+/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}»"'’]+$/;
const INVITE_FORMS: ReadonlySet<string> = new Set(['chat', 'join']);

export type ContentDetailAttachment = {
  readonly mimeType?: string | null;
  readonly fileName?: string | null;
  readonly originalName?: string | null;
  readonly thumbnailUrl?: string | null;
};

export type ContentDetailSource = {
  readonly text: string;
  readonly metadata?: unknown;
  readonly storyReplyToId?: string | null;
  readonly firstAttachment?: ContentDetailAttachment;
};

export type InviteSummary = { readonly conversationTitle: string | null; readonly memberCount: number | null };

/** Ce qu'une clé de lien de partage ANNONCE — `null` pour un lien inconnu, inactif ou échu. */
export type InviteLookup = (shareLinkKey: string) => Promise<InviteSummary | null>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const bounded = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? sliceCodePoints(trimmed, MAX_TITLE_LENGTH) : null;
};

/**
 * La lecture qu'une invitation mérite, et rien de plus : ce que l'aperçu PUBLIC
 * du lien (`GET /anonymous/link/:identifier`) sert déjà à quiconque le tient —
 * le titre — plus l'effectif. Un lien désactivé ou échu n'annonce rien : la
 * bannière ne doit pas révéler ce que la porte refuserait.
 */
export function shareLinkInviteLookup(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  now: () => Date = () => new Date(),
): InviteLookup {
  return async (key) => {
    const link = await prisma.conversationShareLink.findFirst({
      where: { OR: [{ linkId: key }, { identifier: key }] },
      select: {
        isActive: true,
        expiresAt: true,
        name: true,
        conversation: { select: { title: true, memberCount: true } },
      },
    });
    if (!link?.isActive) return null;
    if (link.expiresAt && link.expiresAt.getTime() <= now().getTime()) return null;
    return {
      conversationTitle: bounded(link.conversation?.title) ?? bounded(link.name),
      memberCount: typeof link.conversation?.memberCount === 'number' && link.conversation.memberCount > 0
        ? link.conversation.memberCount
        : null,
    };
  };
}

function firstUrlOf(text: string): { readonly raw: string; readonly url: URL } | null {
  const match = URL_IN_TEXT.exec(text);
  if (!match) return null;
  const raw = match[0].replace(TRAILING_PUNCTUATION, '');
  if (raw.length > MAX_URL_LENGTH) return null;
  try {
    return { raw, url: new URL(raw) };
  } catch {
    return null;
  }
}

const isMeeshyHost = (host: string): boolean => host === 'meeshy.me' || host.endsWith('.meeshy.me');

/** La clé d'un lien d'invitation Meeshy (`/chat/<clé>`, `/join/<clé>`, sous https ou `meeshy://`), sinon `null`. */
function inviteKeyOf(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  const [form, key] = url.protocol === 'meeshy:' ? [url.host, segments[0]] : segments;
  const fromMeeshy = url.protocol === 'meeshy:' || isMeeshyHost(url.hostname.toLowerCase());
  if (!fromMeeshy || !form || !INVITE_FORMS.has(form.toLowerCase()) || !key) return null;
  return SHARE_LINK_KEY.test(key) ? key : null;
}

async function linkDetailOf(text: string, lookupInvite: InviteLookup): Promise<NotificationContentDetail> {
  const found = firstUrlOf(text);
  if (!found) return {};
  const { raw: href, url } = found;
  const inviteKey = inviteKeyOf(url);
  if (inviteKey) {
    const summary = await lookupInvite(inviteKey).catch(() => null);
    return {
      invite: { url: href, conversationTitle: summary?.conversationTitle ?? null, memberCount: summary?.memberCount ?? null },
    };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return {};
  return { link: { url: href, domain: url.hostname.toLowerCase().replace(/^www\./, '') } };
}

function storyReplyOf(storyReplyToId: string | null | undefined, metadata: unknown): NotificationContentDetail {
  if (!storyReplyToId) return {};
  const snapshot = isRecord(metadata) && isRecord(metadata.postReplyTo) ? metadata.postReplyTo : null;
  if (snapshot && snapshot.type !== 'STORY') return {};
  const authorId = typeof snapshot?.authorId === 'string' ? snapshot.authorId : null;
  return { storyReply: { authorId } };
}

function attachmentDetailOf(att: ContentDetailAttachment | undefined): NotificationContentDetail {
  if (!att) return {};
  if (isContactCardAttachment({ mimeType: att.mimeType, fileName: att.originalName ?? att.fileName })) {
    return { contact: { name: contactCardNameFromFileName(att.originalName) } };
  }
  if (att.mimeType?.startsWith('video/') && att.thumbnailUrl) {
    return { videoThumbnailUrl: att.thumbnailUrl };
  }
  return {};
}

/**
 * Le détail d'un message, ou `null` quand il n'a rien d'autre à dire que son
 * texte. L'appelant ne l'appelle QUE pour un média qui a le droit de voyager.
 */
export async function resolveContentDetail(
  source: ContentDetailSource,
  lookupInvite: InviteLookup,
): Promise<NotificationContentDetail | null> {
  const place = sharedPlaceFromMetadata(source.metadata);
  const sticker = stickerFromMetadata(source.metadata);
  const detail: NotificationContentDetail = {
    ...(place
      ? { location: { latitude: place.latitude, longitude: place.longitude, name: place.name, address: place.address } }
      : {}),
    ...(sticker ? { sticker: { emoji: sticker.emoji ?? null } } : {}),
    ...attachmentDetailOf(source.firstAttachment),
    ...(place ? {} : await linkDetailOf(source.text, lookupInvite)),
    ...storyReplyOf(source.storyReplyToId, source.metadata),
  };
  return Object.keys(detail).length > 0 ? detail : null;
}

/** La catégorie iOS que le détail élit — celle dont les actions servent CE contenu. */
export function contentDetailCategory(detail: NotificationContentDetail | undefined): NotificationContentCategory | undefined {
  if (detail?.location) return 'MEESHY_LOCATION';
  if (detail?.contact) return 'MEESHY_CONTACT';
  if (detail?.invite) return 'MEESHY_INVITE';
  return undefined;
}

const present = (entries: ReadonlyArray<readonly [string, string | null | undefined]>): Record<string, string> =>
  Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string' && entry[1] !== ''));

/**
 * Le détail aplati en clés `data` (chaînes : FCM n'en accepte pas d'autres).
 * Une clé absente n'est pas posée — jamais une chaîne vide qui mentirait sur ce
 * que le serveur sait.
 */
export function contentDetailPushFields(detail: NotificationContentDetail | undefined): Record<string, string> {
  if (!detail) return {};
  return present([
    ['locationLat', detail.location ? String(detail.location.latitude) : null],
    ['locationLon', detail.location ? String(detail.location.longitude) : null],
    ['locationName', detail.location?.name],
    ['locationAddress', detail.location?.address],
    ['contactName', detail.contact?.name],
    ['inviteUrl', detail.invite?.url],
    ['inviteConversationTitle', detail.invite?.conversationTitle],
    ['inviteMemberCount', detail.invite?.memberCount != null ? String(detail.invite.memberCount) : null],
    ['linkUrl', detail.link?.url],
    ['linkDomain', detail.link?.domain],
    ['thumbnailUrl', detail.videoThumbnailUrl ? publicMediaUrlFromEnv(detail.videoThumbnailUrl) : null],
    ['storyReply', detail.storyReply ? '1' : null],
  ]);
}

const withoutUrl = (text: string, url: string): string => text.replace(url, '').replace(/\s{2,}/g, ' ').trim();

function locationLine(lang: string, location: NonNullable<NotificationContentDetail['location']>): string {
  const place = [location.name, location.address].filter((part): part is string => !!part?.trim());
  return place.length > 0 ? `📍 ${place.join(' · ')}` : notificationString(lang, 'content.location');
}

/**
 * Le corps avant la mention « réponse à une story » : la ligne du contenu
 * quand il en a une, sinon la composition ordinaire (texte servi, libellé de
 * pièce jointe, badges) que `compose` porte.
 */
function contentBody(lang: string, text: string, detail: NotificationContentDetail, compose: (text: string) => string): string {
  if (detail.location) return [locationLine(lang, detail.location), text.trim()].filter(Boolean).join('\n');
  if (detail.sticker) {
    const line = `${detail.sticker.emoji ?? '🏷'} ${notificationString(lang, 'content.sticker')}`;
    return [text.trim(), line].filter(Boolean).join('\n');
  }
  if (detail.invite) {
    const title = detail.invite.conversationTitle;
    const line = `${notificationString(lang, 'content.invitation')}${title ? ` · ${title}` : ''}`;
    return [compose(withoutUrl(text, detail.invite.url)), line].filter(Boolean).join('\n');
  }
  if (detail.link) {
    return [compose(withoutUrl(text, detail.link.url)), `🔗 ${detail.link.domain}`].filter(Boolean).join('\n');
  }
  return compose(text);
}

/**
 * Le corps servi d'une bannière de message, détail compris. `text` est le
 * texte que le Prisme a DÉJÀ servi ; `compose` est la composition ordinaire,
 * appelée pour tout contenu sans ligne propre.
 */
export function detailedBannerBody(lang: string, params: {
  text: string;
  detail: NotificationContentDetail | undefined;
  readerId: string;
  compose: (text: string) => string;
}): string {
  const { detail } = params;
  if (!detail) return params.compose(params.text);
  const body = contentBody(lang, params.text, detail, params.compose);
  if (!detail.storyReply) return body;
  const prefix = notificationString(
    lang,
    detail.storyReply.authorId === params.readerId ? 'content.storyReply.yours' : 'content.storyReply.other',
  );
  return body ? `${prefix} · ${body}` : prefix;
}
