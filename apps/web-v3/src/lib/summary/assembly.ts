import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';
import { getAttachmentType } from '@meeshy/shared/types/attachment';
import { parseMentions, type MentionParticipant } from '@meeshy/shared/utils/mention-parser';

import type { Message, Participant } from '@/lib/api/types';
import { presenceOf } from '@/lib/view/conversation';

import { buildDigest } from './digest';
import { segmentEpisodes } from './episodes';
import { makeFaceRampInputs, rankFaceRamp } from './face-ramp';
import type {
  ConversationEpisode,
  DeterministicConversationDigest,
  DigestInputMessage,
  DigestMediaKind,
  DigestParticipant,
  EpisodeInputMessage,
  FaceRampEntry,
} from './types';

/**
 * LE SEUL POINT QUI ASSEMBLE LES TROIS LOIS — miroir de
 * `LivingSummaryAssembly.swift` (#5695, étape 7). Aucune loi n'est réécrite
 * ici : ce fichier ne fait QUE des conversions de type entre le monde
 * `Message`/`Participant` et les entrées pures de `episodes.ts` /
 * `digest.ts` / `face-ramp.ts`.
 */

export type LivingSummaryViewer = {
  readonly id: string;
  /** `null` ⇒ jamais de mention (biais faux négatif conservé, écart 1 déclaré). */
  readonly handle: string | null;
  readonly displayName: string;
};

export type LivingSummaryInput = {
  readonly messages: readonly Message[];
  readonly viewer: LivingSummaryViewer;
  readonly participants: readonly Participant[];
  readonly windowCoversUnread: boolean;
  /** epoch ms — figé au montage, jamais relu à chaque rendu. */
  readonly now: number;
  readonly locale: string;
};

export type LivingSummaryModel = {
  readonly digest: DeterministicConversationDigest;
  readonly faceRamp: readonly FaceRampEntry[];
};

// MARK: - Conversions

function episodeInput(message: Message): EpisodeInputMessage {
  return {
    id: message.id,
    senderId: message.senderId,
    createdAt: new Date(message.createdAt).getTime(),
    replyToId: message.replyToId ?? null,
    isSystem: message.messageSource === 'system',
  };
}

/**
 * ÉCART 3 (§1.4) — `AttachmentType` partagé n'a pas de `'location'` :
 * `document`/`text`/`code` se rabattent sur `'file'`, `'location'` reste
 * INATTEIGNABLE depuis une pièce jointe réelle.
 */
function toDigestMediaKind(attachmentType: ReturnType<typeof getAttachmentType>): DigestMediaKind {
  if (attachmentType === 'image') return 'image';
  if (attachmentType === 'video') return 'video';
  if (attachmentType === 'audio') return 'audio';
  return 'file';
}

const URL_PATTERN = /https?:\/\/\S+/g;

/**
 * ÉCART 2 (§1.4) — `trackedLinkMap` n'existe pas dans `@meeshy/shared`
 * (`grep -rn trackedLink packages/shared/types` = 0). Compte les URL
 * `https?://` du CONTENU — rien n'affiche `media.links` cette itération.
 */
function countLinks(content: string): number {
  return content.match(URL_PATTERN)?.length ?? 0;
}

/**
 * `mentionsViewer` — restreinte au SEUL lecteur, via `parseMentions`
 * (`packages/shared/utils/mention-parser.ts`), frontières Unicode. `null`
 * handle (lecteur sans username connu) ⇒ jamais de faux positif.
 */
function mentionsViewer(content: string, viewer: LivingSummaryViewer): boolean {
  if (viewer.handle === null || viewer.handle.length === 0) return false;
  const participant: MentionParticipant = { userId: viewer.id, username: viewer.handle, displayName: viewer.displayName };
  return parseMentions(content, [participant]).includes(viewer.id);
}

function digestInput(message: Message, viewer: LivingSummaryViewer): DigestInputMessage {
  return {
    ...episodeInput(message),
    content: message.content,
    languageCode: message.originalLanguage || null,
    attachmentKinds: (message.attachments ?? []).map((a) => toDigestMediaKind(getAttachmentType(a.mimeType, a.fileName))),
    linkCount: countLinks(message.content),
    mentionsViewer: mentionsViewer(message.content, viewer),
  };
}

/**
 * Roster DÉRIVÉ DES MESSAGES — premier passage par `senderId`. Identité en
 * cascade : `message.sender` (dénormalisé par la passerelle) → le
 * `Participant` connu de `participants` → `{ displayName: senderId }`
 * (repli honnête, jamais un nom fabriqué).
 */
function deriveParticipants(
  messages: readonly Message[],
  participants: readonly Participant[],
  now: number,
): readonly DigestParticipant[] {
  const byUserId = new Map(participants.map((p) => [p.userId ?? p.id, p] as const));
  const seen = new Set<string>();
  const result: DigestParticipant[] = [];
  for (const message of messages) {
    if (seen.has(message.senderId)) continue;
    seen.add(message.senderId);
    const known = message.sender ?? byUserId.get(message.senderId);
    const displayName = known?.displayName ?? message.senderId;
    result.push({
      id: message.senderId,
      displayName,
      avatarUrl: known?.avatar ?? null,
      colorHex: authorAccentColor(message.senderId, displayName),
      presence: presenceOf(known, now),
    });
  }
  return result;
}

export function buildLivingSummary(input: LivingSummaryInput): LivingSummaryModel {
  const episodeInputs = input.messages.map(episodeInput);
  const episodes: readonly ConversationEpisode[] = segmentEpisodes(episodeInputs, { locale: input.locale });

  const digestInputs = input.messages.map((m) => digestInput(m, input.viewer));
  const participants = deriveParticipants(input.messages, input.participants, input.now);

  const digest = buildDigest({
    messages: digestInputs,
    participants,
    viewerId: input.viewer.id,
    episodes,
    windowCoversUnread: input.windowCoversUnread,
  });

  const rampInputs = makeFaceRampInputs({ awaitingYou: digest.awaitingYou, participants });
  const faceRamp = rankFaceRamp(rampInputs, input.now);

  return { digest, faceRamp };
}

/**
 * Squelette OU contenu — miroir `LivingSummaryViewModel.showsSkeleton`.
 * Exportée pour que le composant ET le témoin partagent le MÊME prédicat.
 */
export function resolveSkeleton(input: {
  readonly digest: Pick<DeterministicConversationDigest, 'messageCount'>;
  readonly faceRamp: readonly unknown[];
  readonly agentSummary: unknown | null;
}): boolean {
  return input.digest.messageCount === 0 && input.faceRamp.length === 0 && input.agentSummary === null;
}
