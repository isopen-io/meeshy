import type { QueryClient } from '@tanstack/react-query';
import { isReactionAllowed } from '@meeshy/shared/utils/reaction-limit';

import { emitAttachmentReaction } from '@/lib/api/attachment-reaction-emit';
import { patchMediaHubMessages } from '@/lib/api/conversation-media-hub';
import { patchThreadMessages } from '@/lib/api/messages';
import type { Attachment, Message } from '@/lib/api/types';

/**
 * RÉAGIR À UNE PIÈCE, PAS AU MESSAGE (#6303) — miroir de
 * `onReactToMedia(att, emoji)` (iOS, #6084) : la pièce voyage AVEC l'émoji,
 * parce que seule la visionneuse sait quelle page est ouverte. La réaction
 * part par `attachment:reaction-add|remove` (`attachment-reaction-emit.ts`),
 * et la pastille de la tuile (`AttachmentReactionBadge`, #7894) la reflète.
 *
 * Optimiste : le résumé et « la mienne » bougent AVANT l'accusé, dans le cache
 * du fil (la même ligne que la tuile lit) ET dans l'index de l'écran des
 * médias (#8180 — la visionneuse qui en est ouverte y relit sa page) ; un refus ou une coupure les
 * RENDENT tels qu'ils étaient — jamais une pastille qui ment sur ce qui est
 * parti. La diffusion `attachment:reaction-*` qui suit remplace ensuite le
 * résumé par le compte ABSOLU du serveur (`realtime-attachment-reactions.ts`).
 */
export type AttachmentReactionPlan = 'add' | 'remove' | 'refused';

export function attachmentReactionPlan(mine: readonly string[], emoji: string): AttachmentReactionPlan {
  if (mine.includes(emoji)) return 'remove';
  return isReactionAllowed(mine.length) ? 'add' : 'refused';
}

type Reactable = Pick<Attachment, 'reactionSummary' | 'currentUserReactions'>;

/** Le delta d'UN émoji sur UNE pièce — un compte qui tombe à zéro RETIRE sa clé. */
export function withAttachmentReaction<T extends Reactable>(attachment: T, emoji: string, delta: 1 | -1): T {
  const summary = attachment.reactionSummary ?? {};
  const count = Math.max(0, (summary[emoji] ?? 0) + delta);
  const { [emoji]: _dropped, ...others } = summary;
  const mine = attachment.currentUserReactions ?? [];
  return {
    ...attachment,
    reactionSummary: count === 0 ? others : { ...others, [emoji]: count },
    currentUserReactions: delta === 1 ? [...mine.filter((e) => e !== emoji), emoji] : mine.filter((e) => e !== emoji),
  };
}

export type AttachmentReactionOutcome = 'ok' | 'refused' | 'offline' | 'limit';

export async function performAttachmentReaction(params: {
  readonly queryClient: QueryClient;
  readonly conversationId: string;
  readonly messageId: string;
  readonly attachmentId: string;
  readonly emoji: string;
  readonly mine: readonly string[];
}): Promise<AttachmentReactionOutcome> {
  const { queryClient, conversationId, messageId, attachmentId, emoji, mine } = params;
  const plan = attachmentReactionPlan(mine, emoji);
  if (plan === 'refused') return 'limit';
  const delta: 1 | -1 = plan === 'add' ? 1 : -1;
  const onPiece = (d: 1 | -1) => (messages: readonly Message[]): readonly Message[] =>
    messages.map((message) =>
      message.id !== messageId || message.attachments === undefined
        ? message
        : {
            ...message,
            attachments: message.attachments.map((attachment) =>
              attachment.id === attachmentId ? withAttachmentReaction(attachment, emoji, d) : attachment,
            ),
          },
    );
  const apply = (d: 1 | -1): void => {
    patchThreadMessages(queryClient, conversationId, onPiece(d));
    patchMediaHubMessages(queryClient, conversationId, onPiece(d));
  };
  apply(delta);
  const ack = await emitAttachmentReaction({ action: plan, attachmentId, messageId, emoji });
  if (ack !== 'ok') apply(delta === 1 ? -1 : 1);
  return ack;
}
