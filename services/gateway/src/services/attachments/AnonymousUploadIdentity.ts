/**
 * Résolution d'identité anonyme pour les chemins d'upload qui ne passent PAS
 * par le middleware d'auth unifié (`middleware/auth.ts`).
 *
 * Contexte (task-1-fix-round-2, Critical 1) : `routes/uploads/tus-handler.ts`
 * (endpoint resumable `/api/v1/uploads`) traitait un `X-Session-Token`
 * anonyme comme une CHAÎNE LITTÉRALE — `userId = String(sessionToken)` —
 * sans jamais vérifier qu'elle correspondait à un `Participant` réel, et sans
 * jamais consulter le lien de partage qui l'a fait naître. Un invité dont le
 * lien interdit fichiers ET images pouvait donc téléverser par ce chemin et
 * attacher le résultat à un message : l'autorisation n'était simplement
 * jamais interrogée.
 *
 * Ce module fournit la RÉSOLUTION D'IDENTITÉ que `middleware/auth.ts` fait
 * déjà pour tous les autres chemins (`AuthMiddleware.createAnonymousUserContext`)
 * — même requête (`sessionTokenHash`, `type: 'anonymous'`, `isActive: true`),
 * même lecture de `anonymousSession.shareLinkId` — pour que le handler TUS
 * puisse enfin consulter le lien de partage. Extrait dans un module à part
 * (dépendance Prisma structurelle minimale, pas le `PrismaClient` complet)
 * pour rester testable sans la gymnastique de mock ESM que `@tus/server`
 * impose au fichier de route lui-même.
 */

import { promises as fs } from 'fs';
import { hashSessionToken } from '../../utils/session-token.js';
import { GUEST_ATTACHMENT_MAX_BYTES, GUEST_ATTACHMENT_REFUSAL_CODES } from '@meeshy/shared/types/guest-attachment-kinds';
import {
  classifyAnonymousAttachment,
  guestAttachmentNeedsFullContent,
  type AnonymousAttachmentVerdict,
  type ShareLinkAnonymousFlags,
} from './ContentSignature.js';

export interface AnonymousUploadIdentityPrisma {
  participant: {
    findFirst(args: {
      where: { sessionTokenHash: string; type: 'anonymous'; isActive: true };
      select: { id: true; anonymousSession: true };
    }): Promise<{ id: string; anonymousSession: { shareLinkId: string } | null } | null>;
  };
  conversationShareLink: {
    findUnique(args: {
      where: { id: string };
      select: {
        allowAnonymousFiles: true;
        allowAnonymousImages: true;
        allowedAttachmentKinds: true;
        conversation: { select: { identifier: true } };
      };
    }): Promise<ShareLinkAnonymousFlags | null>;
  };
}

export type AnonymousUploadIdentity = {
  readonly participantId: string;
  readonly shareLinkId: string;
};

/**
 * Résout un `X-Session-Token` anonyme en une identité RÉELLE, ou `null` si
 * le jeton ne correspond à aucun participant anonyme actif — même contrat
 * que `AuthMiddleware.createAnonymousUserContext` (`middleware/auth.ts`),
 * qui lève dans ce cas plutôt que de faire confiance au jeton brut.
 *
 * `shareLinkId` peut être une chaîne vide si le participant n'a pas de
 * session anonyme embarquée (cas structurel improbable pour `type:
 * 'anonymous'`, mais `anonymousSession` reste nullable au schéma) — un
 * appelant qui interroge `fetchShareLinkAnonymousFlags` avec cette valeur
 * obtient `null` (aucun lien ne porte l'id vide), donc un refus par défaut,
 * pas un contournement.
 */
export async function resolveAnonymousUploadIdentity(
  prisma: AnonymousUploadIdentityPrisma,
  sessionToken: string
): Promise<AnonymousUploadIdentity | null> {
  const participant = await prisma.participant.findFirst({
    where: {
      sessionTokenHash: hashSessionToken(sessionToken),
      type: 'anonymous',
      isActive: true,
    },
    select: { id: true, anonymousSession: true },
  });

  if (!participant) return null;

  return {
    participantId: participant.id,
    shareLinkId: participant.anonymousSession?.shareLinkId ?? '',
  };
}

/**
 * Drapeaux d'autorisation anonyme du lien, ou `null` si l'id est vide ou ne
 * correspond à aucun lien — même verdict que `routes/attachments/upload.ts`
 * (« Share link not found ») pour rester cohérent entre les deux chemins
 * d'upload.
 */
export async function fetchShareLinkAnonymousFlags(
  prisma: AnonymousUploadIdentityPrisma,
  shareLinkId: string
): Promise<ShareLinkAnonymousFlags | null> {
  if (!shareLinkId) return null;
  return prisma.conversationShareLink.findUnique({
    where: { id: shareLinkId },
    select: { allowAnonymousFiles: true, allowAnonymousImages: true, allowedAttachmentKinds: true, conversation: { select: { identifier: true } } },
  });
}

/**
 * Lit uniquement les premiers octets d'un fichier déjà écrit sur disque —
 * nécessaire pour `tus-handler.ts` : contrairement à `routes/attachments/
 * upload.ts` (fichier entier déjà en mémoire via `part.toBuffer()`), un
 * upload resumable peut peser jusqu'à 4 Go et ne doit jamais être chargé en
 * entier pour un simple reniflement de signature.
 *
 * Rend un buffer plus court que `length` si le fichier est plus petit — les
 * fonctions de `ContentSignature.ts` gèrent déjà ce cas (buffer trop court
 * ⇒ signature non reconnue, jamais une exception).
 */
export async function readFilePrefix(filePath: string, length: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * La garde des familles d'un invité (#10001) sur un fichier déjà écrit sur
 * disque : elle lit le fichier ENTIER — un préfixe ne prouve rien —, après en
 * avoir borné la taille sans le charger (`GUEST_ATTACHMENT_MAX_BYTES`), puisque
 * le chemin resumable accepte jusqu'à 4 Go.
 */
const guestTooLarge = (): Extract<AnonymousAttachmentVerdict, { allowed: false }> => ({
  allowed: false,
  reason: `Guest attachments are limited to ${GUEST_ATTACHMENT_MAX_BYTES} bytes on this conversation`,
  code: GUEST_ATTACHMENT_REFUSAL_CODES.TOO_LARGE,
});

/**
 * Le refus d'un téléversement d'invité ANNONCÉ trop lourd, avant le premier
 * octet — `null` quand le lien ne restreint pas par famille ou que la taille
 * tient sous le plafond.
 */
export function guestUploadSizeRefusal(
  shareLink: ShareLinkAnonymousFlags | null,
  announcedSize: number,
): Extract<AnonymousAttachmentVerdict, { allowed: false }> | null {
  if (!shareLink || !guestAttachmentNeedsFullContent(shareLink)) return null;
  return announcedSize > GUEST_ATTACHMENT_MAX_BYTES ? guestTooLarge() : null;
}

export async function classifyGuestFileOnDisk(params: {
  readonly filePath: string;
  readonly mimeType: string;
  readonly fileName: string;
  readonly shareLink: ShareLinkAnonymousFlags;
}): Promise<AnonymousAttachmentVerdict> {
  const { size } = await fs.stat(params.filePath);
  if (size > GUEST_ATTACHMENT_MAX_BYTES) return guestTooLarge();
  const content = await fs.readFile(params.filePath);
  return classifyAnonymousAttachment(params.mimeType, content, params.shareLink, { fileName: params.fileName });
}

/**
 * Le refus d'un invité tel que `@tus/server` le renvoie : l'enveloppe d'erreur
 * de l'API (`{ success, error, message, code }`) pour que le client lise le
 * code stable, 413 pour un fichier trop lourd, 403 sinon. Un refus sans code
 * (lien sans liste de familles) garde son corps texte d'avant.
 */
export function guestRefusalResponse(
  verdict: Extract<AnonymousAttachmentVerdict, { allowed: false }>,
): { readonly status_code: number; readonly body: string } {
  if (!verdict.code) return { status_code: 403, body: `${verdict.reason}\n` };
  const status = verdict.code === GUEST_ATTACHMENT_REFUSAL_CODES.TOO_LARGE ? 413 : 403;
  const envelope = { success: false, error: verdict.reason, message: verdict.reason, code: verdict.code };
  return { status_code: status, body: `${JSON.stringify(envelope)}\n` };
}
