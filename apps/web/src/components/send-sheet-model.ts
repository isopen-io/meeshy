import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import type { SharePlan, ShareWithheldReason, ShareWithdrawReason } from '@meeshy/shared/utils/share-plan';

import { accentOf } from '@/lib/accent';
import type { PersonSummary } from '@/lib/api/friend-requests';
import type { Conversation } from '@/lib/api/types';
import { candidatesFor } from '@/lib/conversation-new/candidates';
import type { SendSheetCatalogKey } from '@/lib/i18n-send-sheet-catalog';
import { sendRefusalOf, type SendRefusal } from '@/lib/send/forward-refusal';
import { conversationEncrypted } from '@/lib/send/share-entry';
import { targetKeyOf, type SendPayload, type SendPlanError, type SendPreview, type SendTarget } from '@/lib/send/send-sheet-plan';
import type { TargetStatus } from '@/lib/send/send-sheet-run';
import { avatarOf, initialsOf, participantAvatarOf, peerOf, presenceKeyOf, titleOf } from '@/lib/view/conversation';

/**
 * CE QUE L'ÉCRAN DE PARTAGE MONTRE, en fonctions PURES (#8884, #10948) — les
 * lignes de destinataires (conversations, personnes, communautés dépliées),
 * l'aperçu de ce qui part, le motif de ce qui est retiré ou interdit, le mot de
 * chaque état. La vue ne décide rien : elle rend ces valeurs.
 */

export type RecipientTarget = Extract<SendTarget, { readonly kind: 'conversation' | 'contact' }>;

export type RecipientRow = {
  readonly key: string;
  readonly target: RecipientTarget;
  readonly label: string;
  readonly initials: string;
  readonly color: string;
  readonly avatarUrl?: string;
  readonly isGroup: boolean;
  /** La clé de présence d'UNE personne (direct, ami) ; jamais pour un groupe. */
  readonly presenceKey?: string;
  /** Ce qui porte le contour équipé (participant, personne) — lu par `servedRingOf`. */
  readonly ringBearer?: unknown;
  readonly encrypted: boolean;
  /** La ligne secondaire : « Groupe · 12 membres », « Ami », « Chiffrée ». */
  readonly detail?: SubtitleRef;
};

export type SubtitleRef = { readonly key: SendSheetCatalogKey; readonly count?: number };

/** Une communauté : ses canaux où l'on peut écrire, dépliés (D11). */
export type CommunityRow = {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly color: string;
  readonly avatarUrl?: string;
  readonly channels: readonly RecipientRow[];
};

/** La rangée « Récents » — assez pour un pouce, jamais une seconde liste. */
export const RECENTS_MAX = 8;

const fold = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr');

const avatarProp = (url: string | undefined): { readonly avatarUrl?: string } => (url === undefined ? {} : { avatarUrl: url });

/** On peut y écrire : ni lecture seule, ni restriction servie au lecteur. */
const writable = (conversation: Conversation): boolean => conversation.isActive !== false && (conversation.viewerWriteRestriction ?? null) === null;

/** L'effectif n'est dit que s'il est servi : un compte absent ne s'invente pas (et ne s'écrit pas « {count} »). */
function detailOf(conversation: Conversation, encrypted: boolean): SubtitleRef | undefined {
  const count = conversation.memberCount;
  const known = conversation.type !== 'direct' && typeof count === 'number' && Number.isFinite(count) && count > 0;
  if (!known) return encrypted ? { key: 'sendSheet.row.encrypted' } : undefined;
  return { key: encrypted ? 'sendSheet.row.encryptedGroup' : 'sendSheet.row.group', count };
}

function conversationRow(conversation: Conversation, viewerId: string): RecipientRow {
  const label = titleOf(conversation, viewerId);
  const avatarUrl = avatarOf(conversation, viewerId);
  const isGroup = conversation.type !== 'direct';
  const encrypted = conversationEncrypted(conversation);
  const peer = isGroup ? undefined : peerOf(conversation, viewerId);
  const presenceKey = presenceKeyOf(peer);
  const detail = detailOf(conversation, encrypted);
  const target: RecipientTarget = {
    kind: 'conversation',
    conversationId: conversation.id,
    label,
    ...avatarProp(avatarUrl),
    ...(isGroup ? { isGroup } : {}),
    ...(encrypted ? { encrypted } : {}),
  };
  return {
    key: targetKeyOf(target),
    target,
    label,
    initials: initialsOf(label),
    color: accentOf(conversation),
    isGroup,
    encrypted,
    ...avatarProp(avatarUrl),
    ...(presenceKey === undefined ? {} : { presenceKey }),
    ...(peer === undefined ? {} : { ringBearer: peer }),
    ...(detail === undefined ? {} : { detail }),
  };
}

function personRow(person: PersonSummary, friend: boolean): RecipientRow {
  const label = person.displayName ?? person.username;
  const avatarUrl = participantAvatarOf({ avatar: person.avatar ?? undefined });
  const target: RecipientTarget = { kind: 'contact', userId: person.id, label, ...avatarProp(avatarUrl) };
  return {
    key: targetKeyOf(target),
    target,
    label,
    initials: initialsOf(label),
    color: colorForName(label),
    isGroup: false,
    encrypted: false,
    presenceKey: person.id,
    ringBearer: person,
    detail: { key: friend ? 'sendSheet.row.friendNoConversation' : 'sendSheet.row.noConversation' },
    ...avatarProp(avatarUrl),
  };
}

const uniqueRows = (rows: readonly RecipientRow[]): readonly RecipientRow[] => [...new Map(rows.map((row) => [row.key, row])).values()];

export type CommunityNames = Readonly<Record<string, { readonly name: string; readonly avatar?: string | null }>>;

/**
 * LES DESTINATAIRES — le CACHE d'abord (conversations de la Lentille, amis
 * acceptés), puis la recherche SERVEUR fusionnée : les personnes (la loi de
 * « Nouvelle conversation », `candidatesFor`) et les conversations qu'on ne
 * tient pas en cache. Une personne qui a déjà un direct n'apparaît qu'une fois,
 * par sa conversation. Les canaux d'une communauté où l'on peut écrire se
 * rangent sous elle (D11).
 */
export function recipientRows(params: {
  readonly conversations: readonly Conversation[];
  readonly friends: readonly PersonSummary[];
  readonly searchResults: readonly PersonSummary[] | undefined;
  readonly viewerId: string;
  readonly query: string;
  /** Les conversations que la recherche serveur a trouvées hors du cache. */
  readonly conversationResults?: readonly Conversation[];
  /** Le nom de chaque communauté dont on est membre. */
  readonly communities?: CommunityNames;
}): {
  readonly recents: readonly RecipientRow[];
  readonly conversations: readonly RecipientRow[];
  readonly people: readonly RecipientRow[];
  readonly communities: readonly CommunityRow[];
} {
  const { viewerId } = params;
  const needle = fold(params.query.trim());
  const known = params.conversations.filter(writable);
  const all = known.map((conversation) => conversationRow(conversation, viewerId));
  const knownIds = new Set(known.map((conversation) => conversation.id));
  const found = (params.conversationResults ?? []).filter((conversation) => writable(conversation) && !knownIds.has(conversation.id));
  const everything = [...known, ...found];
  const withDirect = new Set(
    everything.flatMap((conversation) => {
      const peer = conversation.type === 'direct' ? peerOf(conversation, viewerId) : undefined;
      return peer?.userId === undefined ? [] : [peer.userId];
    }),
  );
  const candidates = candidatesFor({ friends: params.friends, query: params.query, searchResults: params.searchResults, viewerId });
  const friendIds = new Set(params.friends.map((person) => person.id));
  const people = [...candidates.friends, ...candidates.others]
    .filter((person) => person.id !== viewerId && !withDirect.has(person.id))
    .map((person) => personRow(person, friendIds.has(person.id)));
  const matches = (row: RecipientRow): boolean => needle === '' || fold(row.label).includes(needle);
  const conversations = uniqueRows([...all.filter(matches), ...found.map((conversation) => conversationRow(conversation, viewerId))]);
  return {
    recents: all.slice(0, RECENTS_MAX),
    conversations,
    people: uniqueRows(people),
    communities: communityRows(everything, viewerId, params.communities ?? {}, needle),
  };
}

function communityRows(conversations: readonly Conversation[], viewerId: string, names: CommunityNames, needle: string): readonly CommunityRow[] {
  const byCommunity = new Map<string, Conversation[]>();
  conversations.forEach((conversation) => {
    const id = conversation.communityId;
    if (id === undefined || id === '' || conversation.type === 'direct') return;
    byCommunity.set(id, [...(byCommunity.get(id) ?? []), conversation]);
  });
  return [...byCommunity.entries()].flatMap(([id, channels]) => {
    const name = names[id]?.name;
    if (name === undefined) return [];
    const rows = channels.map((channel) => conversationRow(channel, viewerId));
    const shown = needle === '' || fold(name).includes(needle) ? rows : rows.filter((row) => fold(row.label).includes(needle));
    if (shown.length === 0) return [];
    const avatar = names[id]?.avatar ?? undefined;
    return [{ id, name, initials: initialsOf(name), color: colorForName(name), channels: shown, ...avatarProp(avatar === null ? undefined : avatar) }];
  });
}

export type MessageRef = { readonly key: SendSheetCatalogKey; readonly count?: number };

export type StatusView = { readonly tone: 'sending' | 'sent' | 'failed' | 'queued'; readonly label: SendSheetCatalogKey; readonly retry: boolean };

const FAILURE_LABEL = {
  network: 'sendSheet.state.failed',
  unavailable: 'sendSheet.state.failed',
  download: 'sendSheet.failure.download',
  refused: 'sendSheet.failure.refused',
} as const satisfies Readonly<Record<string, SendSheetCatalogKey>>;

/** Un refus dont le serveur a dit le motif (#9573, #9598) : la ligne l'EXPLIQUE, et ne propose pas de rejouer ce qui sera refusé encore. */
const REFUSAL_LABEL = {
  'view-once': 'sendSheet.failure.forward.viewOnce',
  'after-read': 'sendSheet.failure.forward.afterRead',
  unavailable: 'sendSheet.failure.forward.unavailable',
  encrypted: 'sendSheet.failure.forward.encrypted',
  'not-in-source': 'sendSheet.failure.forward.notInSource',
  'protected-media': 'sendSheet.protected',
} as const satisfies Readonly<Record<SendRefusal, SendSheetCatalogKey>>;

/** Le mot d'une ligne. `started` : l'envoi est lancé — une cible pas encore jouée se dit DÉJÀ « Envoi… » (optimiste). */
export function statusViewOf(status: TargetStatus | undefined, started: boolean): StatusView | null {
  if (status === undefined || (status.state === 'idle' && !started)) return null;
  switch (status.state) {
    case 'idle':
    case 'sending':
      return { tone: 'sending', label: 'sendSheet.state.sending', retry: false };
    case 'queued':
      return { tone: 'queued', label: 'sendSheet.state.queued', retry: false };
    case 'sent':
      return { tone: 'sent', label: 'sendSheet.state.sent', retry: false };
    case 'failed': {
      const refusal = status.failure.kind === 'refused' ? sendRefusalOf(status.failure) : null;
      return refusal === null
        ? { tone: 'failed', label: FAILURE_LABEL[status.failure.kind], retry: true }
        : { tone: 'failed', label: REFUSAL_LABEL[refusal], retry: false };
    }
  }
}

export function planErrorMessageOf(error: SendPlanError): MessageRef {
  switch (error.kind) {
    case 'too-many-targets':
      return { key: 'sendSheet.limit.recipients', count: error.max };
    case 'caption-too-long':
      return { key: 'sendSheet.error.captionTooLong', count: error.max };
    case 'over-limits':
      return { key: 'sendSheet.limit.removeToSend', count: error.trimCount };
    case 'blocked':
      return { key: 'sendSheet.blocked.title' };
    default:
      return { key: 'sendSheet.state.failed' };
  }
}

/** Pourquoi une action n'est pas rendue — une ligne grise (planche, zone « Ce qu'on peut en faire »). */
const WITHHELD_LABEL: Readonly<Record<ShareWithheldReason, SendSheetCatalogKey>> = {
  'single-photo-not-a-reel': 'sendSheet.withheld.singlePhoto',
  'not-a-reel': 'sendSheet.withheld.notAReel',
  'too-many-for-publication': 'sendSheet.withheld.tooMany',
  flame: 'sendSheet.withheld.flame',
  blurred: 'sendSheet.withheld.blurred',
  encrypted: 'sendSheet.withheld.encrypted',
  'cites-protected': 'sendSheet.withheld.citesProtected',
};

/** UNE ligne de motif : la raison la plus forte que la loi a donnée (la nature avant la forme). */
export function withheldLineOf(plan: SharePlan): SendSheetCatalogKey | null {
  const order: readonly ShareWithheldReason[] = ['flame', 'blurred', 'encrypted', 'cites-protected', 'too-many-for-publication', 'single-photo-not-a-reel', 'not-a-reel'];
  const reasons = new Set(plan.withheld.map((entry) => entry.reason));
  const strongest = order.find((reason) => reasons.has(reason));
  return strongest === undefined ? null : WITHHELD_LABEL[strongest];
}

const WITHDRAWN_LABEL: Readonly<Record<ShareWithdrawReason, SendSheetCatalogKey>> = {
  'view-once': 'sendSheet.withdrawn.viewOnce',
  'after-read': 'sendSheet.withdrawn.afterRead',
  unavailable: 'sendSheet.withdrawn.unavailable',
};

/** Ce qui reste dans la conversation (D6) : « La photo à vue unique reste dans cette conversation. Les 3 autres messages partent. » */
export function withdrawnLineOf(plan: SharePlan): { readonly reason: SendSheetCatalogKey; readonly leaving: number } | null {
  const first = plan.withdrawn[0];
  if (first === undefined || plan.blocked !== null) return null;
  return { reason: WITHDRAWN_LABEL[first.reason], leaving: plan.kept.length };
}

/** Le motif de la carte « ne sort pas de Meeshy » (fragment 4). */
export const blockedReasonOf = (plan: SharePlan): SendSheetCatalogKey | null => (plan.blocked === null ? null : WITHDRAWN_LABEL[plan.blocked]);

export type PreviewView = {
  readonly kind: SendPreview['kind'];
  readonly label?: MessageRef;
  readonly text?: string;
  readonly thumbUrl?: string;
  readonly count?: number;
};

const kindOfMime = (mime: string): SendPreview['kind'] => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
};

const KIND_LABEL: Readonly<Partial<Record<SendPreview['kind'], SendSheetCatalogKey>>> = {
  image: 'sendSheet.preview.photo',
  sticker: 'sendSheet.preview.sticker',
  video: 'sendSheet.preview.video',
  audio: 'sendSheet.preview.voice',
  file: 'sendSheet.preview.file',
  publication: 'sendSheet.preview.publication',
  profile: 'sendSheet.preview.profile',
  invitation: 'sendSheet.preview.invitation',
};

const labelProp = (kind: SendPreview['kind']): { readonly label?: MessageRef } => {
  const key = KIND_LABEL[kind];
  return key === undefined ? {} : { label: { key } };
};

const optional = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  (value === undefined || value === '' ? {} : { [key]: value }) as Partial<Record<K, V>>;

function fromPreview(preview: SendPreview): PreviewView {
  return { kind: preview.kind, ...labelProp(preview.kind), ...optional('text', preview.text), ...optional('thumbUrl', preview.thumbUrl) };
}

/** L'aperçu de CE QUI PART — `leaving` : combien de messages restent après le retrait (D6). */
export function previewOf(payload: SendPayload, leaving?: number): PreviewView {
  switch (payload.kind) {
    case 'messages': {
      const count = leaving ?? payload.preview.count ?? payload.messages.length;
      return count > 1 ? { kind: 'messages', label: { key: 'sendSheet.preview.messages', count } } : fromPreview(payload.preview);
    }
    case 'attachment': {
      const kind = kindOfMime(payload.mime);
      const visual = kind === 'image' || kind === 'video';
      return { kind, ...labelProp(kind), ...(visual ? { thumbUrl: payload.previewUrl } : {}) };
    }
    case 'publication':
      return { ...fromPreview(payload.preview), kind: 'publication', label: { key: 'sendSheet.preview.publication' } };
    case 'media':
      return fromPreview(payload.preview);
    case 'files': {
      const [first] = payload.files;
      const kind = first === undefined ? 'file' : kindOfMime(first.type);
      return { kind, ...labelProp(kind), ...optional('text', first?.name), ...(payload.files.length > 1 ? { count: payload.files.length } : {}) };
    }
    case 'text':
      return { kind: 'text', text: [payload.text, payload.url].filter((part) => part !== undefined && part !== '').join('\n') };
    case 'profile':
      return { kind: 'profile', label: { key: 'sendSheet.preview.profile' }, text: payload.name, ...optional('thumbUrl', payload.avatarUrl) };
    case 'invitation':
      return { kind: 'invitation', label: { key: 'sendSheet.preview.invitation' }, text: payload.title };
  }
}

/** Le titre de l'écran : « Transférer » quand la source est un message, « Envoyer » sinon (vocabulaire commun). */
export const titleKeyOf = (plan: SharePlan): SendSheetCatalogKey => (plan.title === 'forward' ? 'sendSheet.title.forward' : 'sendSheet.title.send');

/** Le nom d'un groupe neuf (D12) : les prénoms, dans l'ordre choisi. */
export const newGroupTitleOf = (rows: readonly RecipientRow[]): string => rows.map((row) => row.label.split(/\s+/)[0] ?? row.label).join(', ');
