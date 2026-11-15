import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { UnifiedAuthContext } from '../../middleware/auth';
import { canAccessConversation } from '../conversations/utils/access-control';
import { isEndToEndMode } from '../../services/messaging/e2eePlaintextAdmission';
import { resolveConversationId } from '../../utils/conversation-id-cache';

/**
 * Le champ multipart OPTIONNEL par lequel la pièce d'un message déclare sa
 * conversation (#13820). Absent, le téléversement est inchangé (#9223).
 */
export const UPLOAD_DESTINATION_FIELD = 'conversationId';

/**
 * - `admitted` : l'appelant en est membre et le serveur lit son contenu ;
 * - `end-to-end` : chiffrée de bout en bout, le serveur ne garde aucun fichier en clair ;
 * - `not-found` : identifiant inconnu, conversation absente OU appelant non membre —
 *   les trois se disent pareil, sans révéler le mode d'une conversation étrangère (#8099).
 */
export type UploadDestinationVerdict = 'admitted' | 'end-to-end' | 'not-found';

/**
 * La conversation se désigne comme sur les routes voisines : son ObjectId ou son
 * identifiant lisible (`meeshy`, `mshy_…`), résolu par `resolveConversationId`.
 */
export async function judgeUploadDestination(
  prisma: PrismaClient,
  authContext: UnifiedAuthContext,
  identifier: string,
): Promise<UploadDestinationVerdict> {
  const conversationId = await resolveConversationId(prisma, identifier);
  if (!conversationId) return 'not-found';
  if (!(await canAccessConversation(prisma, authContext, conversationId, identifier))) return 'not-found';
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { encryptionMode: true },
  });
  if (!conversation) return 'not-found';
  return isEndToEndMode(conversation.encryptionMode) ? 'end-to-end' : 'admitted';
}

/**
 * Lit [file] jusqu'au bout sans rien en garder (#13820) : la pièce d'une
 * destination refusée doit quitter le fil, sinon le client qui écrit tout son
 * corps avant de lire la réponse reste bloqué.
 */
export async function discardFilePart(file: Readable): Promise<void> {
  file.resume();
  await finished(file);
}

/** Le dépassement de `limits.fileSize` que @fastify/multipart rend en fin de corps (#13820). */
export function isFileSizeOverflow(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE';
}
