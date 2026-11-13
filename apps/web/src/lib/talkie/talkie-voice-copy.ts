import { uploadAttachments, uploadShortfall } from '@/lib/api/attachments';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { createDirectConversation } from '@/lib/api/conversations';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { sendMessage } from '@/lib/api/messages';
import { loadSharedConversations } from '@/lib/api/shared-conversations';
import type { Conversation } from '@/lib/api/types';
import { canSendPlaintext, isEndToEndMode } from '@/lib/end-to-end-regime-ledger';

import type { TalkieVoiceCopier, TalkieVoiceCopy } from './talkie-sender';

/**
 * **LA COPIE VOCALE D'UN TALKIE QUI N'A PAS ÉTÉ ENTENDU** (#16698, iso `TalkieVoiceCopy.swift`, précision porteur
 * #17141) — la voix captée devient un message vocal dans la conversation la plus RÉCENTE partagée avec le destinataire :
 * celle que la passerelle a nommée, sinon la plus récente que le client trouve, sinon la conversation directe EN CLAIR,
 * ouverte au besoin. Jamais une conversation chiffrée de bout en bout (un vocal en clair y est refusé, fail-closed),
 * ni un salon public, ni une chaîne d'annonces, ni une conversation où l'on n'écrit pas.
 *
 * Les trames AAC ADTS mises bout à bout forment un flux `.aac` lisible tel quel ; la passerelle accepte `audio/aac`.
 */

type Candidate = Pick<Conversation, 'id' | 'type' | 'encryptionMode' | 'isActive' | 'isMember' | 'isAnnouncementChannel' | 'viewerWriteRestriction' | 'listRankAt' | 'lastMessageAt' | 'updatedAt'>;

const CLOSED_TYPES: ReadonlySet<string> = new Set(['global', 'public']);

/** Une conversation où la copie peut partir — miroir de `TalkieCopyCandidate.mayCarryTheCopy` (iOS). */
export const mayCarryTheCopy = (candidate: Candidate): boolean =>
  !isEndToEndMode(candidate.encryptionMode) &&
  !CLOSED_TYPES.has(candidate.type) &&
  candidate.isMember !== false &&
  candidate.isActive !== false &&
  candidate.isAnnouncementChannel !== true &&
  candidate.viewerWriteRestriction == null &&
  canSendPlaintext({ conversationId: candidate.id, servedMode: candidate.encryptionMode ?? null });

const rankOf = (candidate: Candidate): number => {
  const at = candidate.listRankAt ?? candidate.lastMessageAt ?? candidate.updatedAt;
  const ms = at === undefined || at === null ? Number.NaN : new Date(at).getTime();
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
};

/** La conversation partagée la plus récente qui peut porter la copie ; `null` : il faudra ouvrir le direct. */
export function pickTalkieCopyDestination(candidates: readonly Candidate[]): string | null {
  const eligible = candidates.filter(mayCarryTheCopy);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, candidate) => (rankOf(candidate) > rankOf(best) ? candidate : best)).id;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** `talkie_2026-11-13_1004.aac` — le nom que la bulle montre en repli, daté à l'heure locale du relâcher. */
export const talkieCopyFileName = (at: Date): string =>
  `talkie_${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}${pad(at.getMinutes())}.aac`;

export function talkieCopyFile(frames: readonly Uint8Array[], at: Date): File {
  return new File(frames.map((frame) => new Uint8Array(frame)), talkieCopyFileName(at), { type: 'audio/aac' });
}

async function destinationOf(deps: ConversationsDeps, copy: TalkieVoiceCopy): Promise<string | null> {
  const named = copy.conversationId;
  if (named !== null && canSendPlaintext({ conversationId: named })) return named;
  const shared = await loadSharedConversations({ ...deps, userId: copy.toUserId });
  const picked = shared.ok ? pickTalkieCopyDestination(shared.data) : null;
  if (picked !== null) return picked;
  const direct = await createDirectConversation(deps, copy.toUserId, { plaintext: true });
  return direct.ok && mayCarryTheCopy(direct.data) ? direct.data.id : null;
}

/** Le copieur vivant : choisit la conversation, téléverse la voix, envoie le message vocal. */
export function createTalkieVoiceCopier({
  deps,
  language,
  now = () => new Date(),
}: {
  readonly deps: ConversationsDeps;
  /** La langue de l'interface : celle qu'on prête à la voix tant que la transcription ne l'a pas reconnue. */
  readonly language: () => string;
  readonly now?: () => Date;
}): TalkieVoiceCopier {
  return async (copy) => {
    if (copy.frames.length === 0) return false;
    const conversationId = await destinationOf(deps, copy).catch(() => null);
    if (conversationId === null) return false;
    const file = talkieCopyFile(copy.frames, now());
    const uploaded = await uploadAttachments({ ...deps, pending: [{ file, durationMs: Math.round(copy.durationMs) }] });
    if (uploadShortfall([file], uploaded) !== null || !uploaded.ok) return false;
    const sent = await sendMessage({
      ...deps,
      conversationId,
      body: {
        originalLanguage: language(),
        clientMessageId: newClientMessageId(),
        messageType: 'audio',
        attachmentIds: uploaded.data.attachments.map((attachment) => attachment.id),
      },
    });
    return sent.ok;
  };
}
