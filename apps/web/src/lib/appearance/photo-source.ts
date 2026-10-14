import type { QueryClient } from '@tanstack/react-query';
import * as attachmentsEndpoints from '@meeshy/shared/api/endpoints/attachments';

import { mediaHubConversationKey } from '@/lib/api/media-hub-cache';
import { attachmentSrc } from '@/lib/api/media-url';

/**
 * **D'OÙ VIENT LA PHOTO D'UN FOND** (#10631, § 8.1) — l'image d'une pièce jointe
 * de CETTE conversation, désignée par son seul identifiant. On la retrouve
 * d'abord dans la galerie que le lecteur a déjà en cache (la vignette, puis la
 * pleine définition) ; à défaut, la route de téléchargement de la pièce, qui
 * vérifie l'appartenance à CHAQUE lecture — un ancien membre ne la voit plus et
 * le fond retombe sur Signature (le chargement échoue, voir `useBackdropPhoto`).
 */
export type PhotoSource = { readonly thumb: string | null; readonly full: string };

type CachedAttachment = { readonly id?: unknown; readonly fileUrl?: unknown; readonly thumbnailUrl?: unknown; readonly mimeType?: unknown };

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function cachedAttachment(queryClient: QueryClient, conversationId: string, attachmentId: string): CachedAttachment | undefined {
  for (const [, data] of queryClient.getQueriesData<{ readonly pages?: readonly { readonly messages?: readonly { readonly attachments?: readonly CachedAttachment[] }[] }[] }>({
    queryKey: mediaHubConversationKey(conversationId),
  })) {
    for (const page of data?.pages ?? []) {
      for (const message of page.messages ?? []) {
        const found = message.attachments?.find((attachment) => attachment.id === attachmentId);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

export function photoSourceOf(queryClient: QueryClient, conversationId: string, attachmentId: string): PhotoSource {
  const cached = cachedAttachment(queryClient, conversationId, attachmentId);
  const fileUrl = textOf(cached?.fileUrl);
  const thumbnailUrl = textOf(cached?.thumbnailUrl);
  return {
    thumb: thumbnailUrl === null ? null : attachmentSrc(thumbnailUrl),
    full: attachmentSrc(fileUrl ?? attachmentsEndpoints.byAttachmentId(attachmentId)),
  };
}
