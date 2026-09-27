import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NotificationContext } from '@meeshy/shared/types/notification';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language.js';
import type { NotificationService } from './NotificationService.js';

/**
 * « L'enregistrement de l'appel est prêt » (#8064) — produit une fois le
 * fichier rattaché à la bulle d'appel, pour chaque participant qui y a
 * CONSENTI (jamais pour l'enregistreur lui-même), dans la langue de cadrage du
 * destinataire. Le type était déjà routé par la NSE iOS
 * (`MEESHY_CALL_MISSED`) et par `push-header.ts`, sans producteur.
 */

export type CallRecordingReadyDeps = {
  readonly prisma: Pick<PrismaClient, 'user' | 'conversation'>;
  readonly notifications: Pick<NotificationService, 'createNotification'>;
};

export type CallRecordingReadyParams = {
  readonly recorderId: string;
  readonly recipientUserIds: readonly string[];
  readonly conversationId: string;
  readonly callSessionId: string;
  readonly messageId: string;
};

export async function notifyCallRecordingReady(
  deps: CallRecordingReadyDeps,
  params: CallRecordingReadyParams,
): Promise<number> {
  const recipients = [...new Set(params.recipientUserIds)].filter((id) => id !== params.recorderId);
  if (recipients.length === 0) return 0;

  const [recorder, conversation, readers] = await Promise.all([
    deps.prisma.user.findUnique({
      where: { id: params.recorderId },
      select: { id: true, username: true, displayName: true, avatar: true },
    }),
    deps.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    }),
    deps.prisma.user.findMany({
      where: { id: { in: recipients } },
      select: { id: true, ...RECIPIENT_LANG_SELECT },
    }),
  ]);
  if (!recorder) return 0;

  const context: NotificationContext = {
    conversationId: params.conversationId,
    conversationTitle: conversation?.title ?? undefined,
    conversationType: (conversation?.type ?? undefined) as NotificationContext['conversationType'],
    callSessionId: params.callSessionId,
    messageId: params.messageId,
  };

  const created = await Promise.all(
    readers.map((reader) => {
      const lang = recipientLanguage(reader, 'fr');
      return deps.notifications.createNotification({
        userId: reader.id,
        type: 'call_recording_ready',
        priority: 'normal',
        lang,
        content: notificationString(lang, 'call.recordingReady'),
        actor: {
          id: recorder.id,
          username: recorder.username,
          displayName: recorder.displayName,
          avatar: recorder.avatar,
        },
        context,
        metadata: { action: 'view_conversation', callType: 'audio' },
        collapseId: `call-recording-${params.callSessionId}`,
      });
    }),
  );
  return created.filter(Boolean).length;
}
