import type { QueryClient } from '@tanstack/react-query';
import * as attachmentsEndpoints from '@meeshy/shared/api/endpoints/attachments';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { mediaHubConversationKey } from '@/lib/api/media-hub-cache';
import { attachmentSrc } from '@/lib/api/media-url';

/**
 * **D'OÙ VIENT LA PHOTO D'UN FOND** (#10631, § 8.1) — l'image d'une pièce jointe
 * de CETTE conversation, désignée par son seul identifiant. On la retrouve
 * d'abord dans la galerie que le lecteur a déjà en cache (la vignette, puis la
 * pleine définition) ; à défaut, les MÉTADONNÉES de la pièce
 * (`GET /attachments/:id/metadata`), qui vérifient l'appartenance à chaque
 * lecture et rendent les adresses qu'une `<img>` sait charger. Jamais la route
 * `GET /attachments/:id` : elle exige un en-tête `Authorization` qu'une image
 * n'envoie pas, et le fond restait Signature pour toute photo choisie sur un
 * autre appareil. Un ancien membre reçoit 404 : `null`, le fond retombe sur
 * Signature.
 */
export type PhotoSource = { readonly thumb: string | null; readonly full: string };

type CachedAttachment = { readonly id?: unknown; readonly fileUrl?: unknown; readonly thumbnailUrl?: unknown; readonly isEncrypted?: unknown };

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

/**
 * UNE PIÈCE CHIFFRÉE N'EST JAMAIS UNE PHOTO À PEINDRE (#10665) : ses octets sont
 * un chiffré, que ni le web ni le serveur ne savent ouvrir ici (aucune clé de
 * pièce n'existe côté appareil web). Fail-closed : `null`, le fond reste
 * Signature — jamais une `<img>` pointée sur un chiffré, jamais un clair servi
 * par le serveur.
 */
function sourceOf(attachment: CachedAttachment | undefined): PhotoSource | null {
  if (attachment?.isEncrypted === true) return null;
  const fileUrl = textOf(attachment?.fileUrl);
  if (fileUrl === null) return null;
  const thumbnailUrl = textOf(attachment?.thumbnailUrl);
  return { thumb: thumbnailUrl === null ? null : attachmentSrc(thumbnailUrl), full: attachmentSrc(fileUrl) };
}

/** La photo telle que la galerie en cache la connaît — `null` si elle ne la connaît pas. */
export const photoSourceOf = (queryClient: QueryClient, conversationId: string, attachmentId: string): PhotoSource | null =>
  sourceOf(cachedAttachment(queryClient, conversationId, attachmentId));

const GONE_STATUSES: ReadonlySet<number> = new Set([401, 403, 404, 410]);

/**
 * La galerie en cache d'abord, puis les métadonnées. `null` = la pièce n'est
 * plus lisible par ce lecteur (Signature) ; une panne passagère REJETTE, pour
 * que l'appelant garde la dernière photo connue plutôt que de l'effacer.
 */
export async function loadPhotoSource(params: {
  readonly queryClient: QueryClient;
  readonly deps: ConversationsDeps;
  readonly conversationId: string;
  readonly attachmentId: string;
}): Promise<PhotoSource | null> {
  const { queryClient, deps, conversationId, attachmentId } = params;
  const cached = photoSourceOf(queryClient, conversationId, attachmentId);
  if (cached !== null || deps.source !== 'gateway') return cached;
  const result = await deps.transport.request<unknown>({ method: 'GET', path: attachmentsEndpoints.byAttachmentIdMetadata(attachmentId) });
  if (result.ok) {
    const data = result.data as { readonly attachment?: CachedAttachment } | null | undefined;
    return sourceOf(data?.attachment);
  }
  if (GONE_STATUSES.has(result.status)) return null;
  throw new Error(`photo ${attachmentId}: ${result.status}`);
}
