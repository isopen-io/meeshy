import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';
import { mayLinkRecording } from '@meeshy/shared/utils/call-recording-consent';
import { CALL_SUMMARY_MESSAGE_INCLUDE } from '../CallService';
import { OPEN_RECORDING } from './callRecordingRepository';
import { toConsentState } from './callRecording';

/**
 * Le fichier d'un enregistrement rejoint la BULLE de son appel (#8064).
 *
 * Seul l'enregistreur d'un enregistrement réellement DÉMARRÉ (consenti par
 * tous) peut y lier un fichier, une seule fois, et seulement un fichier audio
 * qu'il a lui-même téléversé et qui n'appartient encore à aucun message. Un
 * fichier d'un autre utilisateur répond « introuvable » — la route ne dit pas
 * qu'il existe.
 */

export type LinkCallRecordingInput = {
  readonly userId: string;
  readonly callId: string;
  readonly recordingId: string;
  readonly attachmentId: string;
};

export type CallSummaryMessage = Prisma.MessageGetPayload<{ include: typeof CALL_SUMMARY_MESSAGE_INCLUDE }>;

export type LinkCallRecordingFailure = {
  readonly kind: 'refused';
  readonly status: 403 | 404 | 409 | 415;
  readonly code:
    | 'RECORDING_NOT_FOUND'
    | 'NOT_THE_RECORDER'
    | 'RECORDING_NEVER_STARTED'
    | 'RECORDING_ALREADY_LINKED'
    | 'ATTACHMENT_NOT_FOUND'
    | 'ATTACHMENT_ALREADY_ATTACHED'
    | 'ATTACHMENT_NOT_AUDIO'
    | 'CALL_BUBBLE_MISSING';
};

export type LinkCallRecordingSuccess = {
  readonly kind: 'linked';
  readonly message: CallSummaryMessage;
  readonly conversationId: string;
  readonly consentedUserIds: readonly string[];
};

export type LinkCallRecordingResult = LinkCallRecordingSuccess | LinkCallRecordingFailure;

type LinkPrisma = Pick<PrismaClient, 'callRecording' | 'messageAttachment' | 'callSession' | 'message'>;

const fail = (status: LinkCallRecordingFailure['status'], code: LinkCallRecordingFailure['code']): LinkCallRecordingFailure => ({
  kind: 'refused',
  status,
  code,
});

const FREE_ATTACHMENT: Prisma.MessageAttachmentWhereInput = {
  OR: [{ messageId: null }, { messageId: { isSet: false } }],
};

const UNLINKED_RECORDING: Prisma.CallRecordingWhereInput = {
  OR: [{ attachmentId: null }, { attachmentId: { isSet: false } }],
};

export async function linkCallRecording(
  prisma: LinkPrisma,
  input: LinkCallRecordingInput,
  now: Date = new Date(),
): Promise<LinkCallRecordingResult> {
  const recording = await prisma.callRecording.findUnique({ where: { id: input.recordingId } });
  if (!recording || recording.callSessionId !== input.callId) return fail(404, 'RECORDING_NOT_FOUND');
  const state = {
    ...toConsentState({
      ...recording,
      startedAt: recording.startedAt ?? null,
      stoppedAt: recording.stoppedAt ?? null,
      stopReason: recording.stopReason ?? null,
      attachmentId: recording.attachmentId ?? null,
    }),
    attachmentId: recording.attachmentId ?? null,
  };
  if (!mayLinkRecording(state, input.userId)) {
    if (recording.requesterId !== input.userId) return fail(403, 'NOT_THE_RECORDER');
    if (!recording.startedAt) return fail(409, 'RECORDING_NEVER_STARTED');
    return fail(409, 'RECORDING_ALREADY_LINKED');
  }

  const attachment = await prisma.messageAttachment.findUnique({
    where: { id: input.attachmentId },
    select: { uploadedBy: true, messageId: true, mimeType: true },
  });
  if (!attachment || attachment.uploadedBy !== input.userId) return fail(404, 'ATTACHMENT_NOT_FOUND');
  if (attachment.messageId) return fail(409, 'ATTACHMENT_ALREADY_ATTACHED');
  if (!attachment.mimeType.startsWith('audio/')) return fail(415, 'ATTACHMENT_NOT_AUDIO');

  const call = await prisma.callSession.findUnique({ where: { id: input.callId }, select: { conversationId: true } });
  if (!call) return fail(404, 'RECORDING_NOT_FOUND');
  const bubble = await prisma.message.findFirst({
    where: { conversationId: call.conversationId, clientMessageId: callSummaryClientMessageId(input.callId) },
    select: { id: true },
  });
  if (!bubble) return fail(409, 'CALL_BUBBLE_MISSING');

  const claimed = await prisma.callRecording.updateMany({
    where: { AND: [{ id: recording.id }, UNLINKED_RECORDING] },
    data: { attachmentId: input.attachmentId, linkedAt: now },
  });
  if (claimed.count === 0) return fail(409, 'RECORDING_ALREADY_LINKED');

  const attached = await prisma.messageAttachment.updateMany({
    where: { AND: [{ id: input.attachmentId, uploadedBy: input.userId }, FREE_ATTACHMENT] },
    data: { messageId: bubble.id },
  });
  if (attached.count === 0) {
    await prisma.callRecording.updateMany({
      where: { id: recording.id, attachmentId: input.attachmentId },
      data: { attachmentId: null, linkedAt: null },
    });
    return fail(409, 'ATTACHMENT_ALREADY_ATTACHED');
  }

  await prisma.callRecording.updateMany({
    where: { AND: [{ id: recording.id }, OPEN_RECORDING] },
    data: { stoppedAt: now, stopReason: 'call-ended' },
  });

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: bubble.id },
    include: CALL_SUMMARY_MESSAGE_INCLUDE,
  });

  return {
    kind: 'linked',
    message,
    conversationId: call.conversationId,
    consentedUserIds: recording.consentedUserIds.filter((id) => id !== input.userId),
  };
}
