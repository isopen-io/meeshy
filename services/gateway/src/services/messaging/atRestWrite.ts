/**
 * #11381 — l'ÉCRITURE d'un texte au repos, pour les deux transports qui
 * créent un message : `MessageProcessor.saveMessage` (REST, socket) et le
 * lien de partage anonyme (`routes/links/messages.ts`), qui le contourne.
 * Un seul énoncé, pour qu'aucun des deux ne range le clair à côté.
 */
import type { Prisma } from '@meeshy/shared/prisma/client';
import type { EncryptionService } from '../EncryptionService';
import { isServerAtRestMode } from './serverAtRest';

export type AtRestMode = 'server' | 'hybrid';

export type SealedText = {
  readonly mode: AtRestMode;
  readonly encryptedContent: string;
  readonly encryptionMetadata: Prisma.InputJsonValue;
};

export const atRestModeOf = (mode: string): AtRestMode => (mode.toLowerCase() === 'hybrid' ? 'hybrid' : 'server');

/** La conversation chiffre-t-elle au repos ? Activée ET d'un mode `server`/`hybrid`. */
export const sealsAtRest = (regime: { readonly encryptionMode?: string | null; readonly encryptionEnabledAt?: Date | null } | null | undefined): boolean =>
  Boolean(regime?.encryptionEnabledAt) && isServerAtRestMode(regime?.encryptionMode);

/**
 * Le texte scellé pour sa conversation ; `null` pour un texte VIDE (photo,
 * vocal, fichier) — rien à cacher, la ligne se range non chiffrée, mode gardé.
 */
export async function sealTextAtRest(params: {
  readonly sealer: Pick<EncryptionService, 'sealAtRest'>;
  readonly mode: string;
  readonly conversationId: string;
  readonly plaintext: string;
  readonly preferredKeyId: string | null;
}): Promise<SealedText | null> {
  if (params.plaintext.length === 0) return null;
  const mode = atRestModeOf(params.mode);
  const sealed = await params.sealer.sealAtRest({
    plaintext: params.plaintext,
    conversationId: params.conversationId,
    preferredKeyId: params.preferredKeyId,
  });
  return {
    mode,
    encryptedContent: sealed.ciphertext,
    encryptionMetadata: { mode, ...sealed.metadata, canTranslate: true },
  };
}
