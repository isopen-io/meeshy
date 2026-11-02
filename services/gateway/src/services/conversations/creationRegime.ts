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
import { creationRegimeData, regimeEpochOf, switchEncryptionRegime } from './encryptionRegime';

export type CreationRegimeRequest = {
  readonly requestedMode: CreationEncryptionMode | undefined;
  readonly plaintext: boolean;
  readonly platformRole: string | null | undefined;
  readonly conversationType: string;
};

export type CreationRegimeRefusal = 'plaintext-with-end-to-end' | 'end-to-end-restricted' | 'end-to-end-direct-only';

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
  // Aucun client n'écrit encore dans un groupe chiffré de bout en bout, et le
  // bout en bout ne se quitte pas : un groupe `e2ee` né ici serait muet à jamais.
  if (request.requestedMode === 'e2ee' && request.conversationType !== 'direct') {
    return { kind: 'refused', refusal: 'end-to-end-direct-only' };
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
  readonly serverKeyIdFor: (conversationId: string, designatedKeyId: string | null) => Promise<string>;
  readonly newConversationId: () => string;
  readonly now: () => Date;
};

export function nascentRegimeDeps(prisma: PrismaClient): NascentRegimeDeps {
  return {
    serverKeyIdFor: async (conversationId, designatedKeyId) =>
      (await getEncryptionService(prisma)).activationKeyId(conversationId, designatedKeyId),
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
  params: { readonly mode: CreationEncryptionMode; readonly enabledBy: string; readonly conversationId?: string },
): Promise<NascentRegime> {
  const conversationId = params.conversationId ?? deps.newConversationId();
  const serverEncryptionKeyId = params.mode === 'e2ee' ? null : await deps.serverKeyIdFor(conversationId, null);
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

export type ReopenedRegime = {
  readonly id: string;
  readonly encryptionMode?: string | null;
  readonly encryptionEnabledAt?: Date | null;
  readonly encryptionEpoch?: number | null;
  readonly serverEncryptionKeyId?: string | null;
};

/**
 * Un tête-à-tête d'avant la directive, sans mode, est stocké en clair : le
 * rouvrir le chiffre au repos (`server`), sous sa clé. Le serveur chiffre
 * toujours au repos — un fil rouvert ne reste pas une exception. Rend les
 * champs de régime posés, ou `null` si rien n'a changé (déjà chiffré, ou une
 * bascule concurrente l'a devancé). Lève `ServerAtRestUnavailableError` sans
 * clé maîtresse : l'appelant ne rouvre pas un fil en clair.
 */
export async function sealReopenedDirect(
  prisma: Pick<PrismaClient, 'conversation'>,
  deps: NascentRegimeDeps,
  params: { readonly conversation: ReopenedRegime; readonly enabledBy: string },
): Promise<Readonly<Record<string, unknown>> | null> {
  const { conversation } = params;
  if (conversation.encryptionMode || conversation.encryptionEnabledAt) return null;
  const serverEncryptionKeyId = await deps.serverKeyIdFor(conversation.id, conversation.serverEncryptionKeyId ?? null);
  const switched = await switchEncryptionRegime(prisma, {
    conversationId: conversation.id,
    observedEpoch: regimeEpochOf(conversation),
    target: { mode: IMPLICIT_CREATION_ENCRYPTION_MODE, protocol: 'aes-256-gcm', enabledBy: params.enabledBy, serverEncryptionKeyId },
    at: deps.now(),
  });
  if (!switched) return null;
  return {
    encryptionMode: switched.mode,
    encryptionProtocol: 'aes-256-gcm',
    encryptionEnabledAt: switched.enabledAt,
    encryptionEnabledBy: switched.enabledBy,
    encryptionEpoch: switched.epoch,
    serverEncryptionKeyId,
  };
}

/**
 * Les champs d'un `conversation.create` qui ne passe pas par l'écran de
 * création (tête-à-tête ouvert par une amitié acceptée, conversation d'un lien
 * de partage, création implicite de la traduction) : `server`, sous une clé
 * obtenue avant. Tout `conversation.create` de production passe par ici ou par
 * `nascentRegime` — garde `conversation-create-sealed-sweep.test.ts`.
 */
export async function implicitConversationRegime(
  prisma: PrismaClient,
  params: { readonly enabledBy: string; readonly conversationId?: string },
): Promise<Readonly<Record<string, unknown>>> {
  const nascent = await nascentRegime(nascentRegimeDeps(prisma), { mode: IMPLICIT_CREATION_ENCRYPTION_MODE, ...params });
  return { id: nascent.conversationId, ...nascent.data };
}
