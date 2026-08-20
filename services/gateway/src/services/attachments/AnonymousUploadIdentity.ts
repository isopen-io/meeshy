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
import type { ShareLinkAnonymousFlags } from './ContentSignature.js';

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
      select: { allowAnonymousFiles: true; allowAnonymousImages: true };
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
    select: { allowAnonymousFiles: true, allowAnonymousImages: true },
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
