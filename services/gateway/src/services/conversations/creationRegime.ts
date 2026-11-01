/**
 * LE RÉGIME D'UNE CONVERSATION NAISSANTE (directive porteur du 2026-11-01).
 *
 * Le mode de chiffrement se choisit à la création, et le serveur chiffre
 * toujours au repos : une conversation ne naît jamais sans mode. Un ancien
 * client qui ne dit rien reçoit `server` (`IMPLICIT_CREATION_ENCRYPTION_MODE`),
 * comme `plaintext: true` — « que le serveur lit » ne veut plus dire « en
 * clair ».
 *
 * `e2ee` se choisit par le même rôle de plateforme qui peut l'activer
 * (`mayChooseEndToEnd`, ANALYST et plus) et ne se combine pas avec
 * `plaintext`. Il ne repasse jamais en clair (#12949).
 *
 * Le régime est écrit PAR la création (`creationRegimeData`), jamais par une
 * bascule après coup : une conversation qui existerait, même un instant, sans
 * mode accepterait un message en clair. La clé `server`/`hybrid` est donc
 * obtenue AVANT la création, sous l'identifiant que la conversation recevra —
 * sans clé maîtresse, rien n'est créé (`SERVER_AT_REST_UNAVAILABLE`).
 */
import { ObjectId } from 'mongodb';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  IMPLICIT_CREATION_ENCRYPTION_MODE,
  mayChooseEndToEnd,
  type CreationEncryptionMode,
} from '@meeshy/shared/utils/conversation-creation-encryption';
import { getEncryptionService } from '../EncryptionService';
import { creationRegimeData } from './encryptionRegime';

export type CreationRegimeRequest = {
  readonly requestedMode: CreationEncryptionMode | undefined;
  readonly plaintext: boolean;
  readonly platformRole: string | null | undefined;
};

export type CreationRegimeRefusal = 'plaintext-with-end-to-end' | 'end-to-end-restricted';

export type CreationRegimeDecision =
  | { readonly kind: 'allowed'; readonly mode: CreationEncryptionMode }
  | { readonly kind: 'refused'; readonly refusal: CreationRegimeRefusal };

export function decideCreationRegime(request: CreationRegimeRequest): CreationRegimeDecision {
  if (request.requestedMode === 'e2ee' && request.plaintext) {
    return { kind: 'refused', refusal: 'plaintext-with-end-to-end' };
  }
  if (request.requestedMode === 'e2ee' && !mayChooseEndToEnd(request.platformRole)) {
    return { kind: 'refused', refusal: 'end-to-end-restricted' };
  }
  return { kind: 'allowed', mode: request.requestedMode ?? IMPLICIT_CREATION_ENCRYPTION_MODE };
}

/**
 * Quel tête-à-tête existant rouvrir (#12966) : un ancien client sans mode ni
 * `plaintext` garde la recherche d'avant ; un mode lisible demandé rouvre le
 * lisible ; `e2ee` ne rouvre que le chiffré.
 */
export type DirectReopening = 'any' | 'readable' | 'end-to-end';

export function directReopeningFor(request: Pick<CreationRegimeRequest, 'requestedMode' | 'plaintext'>): DirectReopening {
  if (request.requestedMode === 'e2ee') return 'end-to-end';
  if (request.plaintext || request.requestedMode !== undefined) return 'readable';
  return 'any';
}

export type NascentRegime = {
  readonly conversationId: string;
  readonly data: Readonly<Record<string, unknown>>;
};

export type NascentRegimeDeps = {
  readonly serverKeyIdFor: (conversationId: string) => Promise<string>;
  readonly newConversationId: () => string;
  readonly now: () => Date;
};

export function nascentRegimeDeps(prisma: PrismaClient): NascentRegimeDeps {
  return {
    serverKeyIdFor: async (conversationId) => (await getEncryptionService(prisma)).activationKeyId(conversationId, null),
    newConversationId: () => new ObjectId().toHexString(),
    now: () => new Date(),
  };
}

/**
 * L'identifiant et les champs de régime à poser dans le `create`. Lève
 * `ServerAtRestUnavailableError` quand la clé `server`/`hybrid` manque :
 * l'appelant ne crée alors rien.
 */
export async function nascentRegime(
  deps: NascentRegimeDeps,
  params: { readonly mode: CreationEncryptionMode; readonly enabledBy: string },
): Promise<NascentRegime> {
  const conversationId = deps.newConversationId();
  const serverEncryptionKeyId = params.mode === 'e2ee' ? null : await deps.serverKeyIdFor(conversationId);
  return {
    conversationId,
    data: creationRegimeData(
      {
        mode: params.mode,
        protocol: params.mode === 'e2ee' ? 'signal_v3' : 'aes-256-gcm',
        enabledBy: params.enabledBy,
        serverEncryptionKeyId,
      },
      deps.now(),
    ),
  };
}
