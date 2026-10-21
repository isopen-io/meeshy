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
import { guestAccessEnd } from '../guestAccessEnd';
import { GUEST_ATTACHMENT_MAX_BYTES, GUEST_ATTACHMENT_REFUSAL_CODES } from '@meeshy/shared/types/guest-attachment-kinds';
import {
  guestShareLinkId,
  shareLinkHasExpired,
  ShareLinkExpiredError,
  SHARE_LINK_EXPIRED_CODE,
} from '../shareLinkReadGate.js';
import {
  classifyAnonymousAttachment,
  guestAttachmentNeedsFullContent,
  type AnonymousAttachmentVerdict,
  type ShareLinkAnonymousFlags,
} from './ContentSignature.js';

export interface AnonymousUploadIdentityPrisma {
  participant: {
    findFirst(args: {
      where: { sessionTokenHash: string; type: 'anonymous'; isActive?: true };
      select: { id: true; shareLinkId?: true; anonymousSession?: true; joinedAt?: true; bannedAt?: true };
    }): Promise<{
      id: string;
      shareLinkId: string | null;
      anonymousSession: { shareLinkId: string } | null;
      joinedAt?: Date | null;
      bannedAt?: Date | null;
    } | null>;
  };
  conversationShareLink: {
    findUnique(args: {
      where: { id: string };
      select: typeof GUEST_SHARE_LINK_SELECT;
    }): Promise<GuestShareLinkRow | null>;
  };
}

/**
 * La lecture UNIQUE du lien d'un invité sur ce chemin : ses drapeaux
 * d'autorisation, et son échéance (#10440) — un seul `select`, pour que la
 * forme structurelle ci-dessus reste satisfaite par le vrai client Prisma.
 */
const GUEST_SHARE_LINK_SELECT = {
  allowAnonymousFiles: true,
  allowAnonymousImages: true,
  allowedAttachmentKinds: true,
  conversation: { select: { identifier: true } },
  expiresAt: true,
  isActive: true,
  guestRevocationPendingAt: true,
} as const;

type GuestShareLinkRow = ShareLinkAnonymousFlags & {
  readonly expiresAt?: Date | null;
  readonly isActive?: boolean | null;
  readonly guestRevocationPendingAt?: Date | null;
};

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
    select: { id: true, shareLinkId: true, anonymousSession: true, joinedAt: true, bannedAt: true },
  });

  // #10492 — un jeton que personne ne porte n'a pas d'identité (401) ; celui
  // d'une participation TERMINÉE porte une cause, la même qu'aux autres portes
  // (410 `GUEST_ACCESS_REVOKED`) : rejouer la session ne servira à rien.
  if (!participant) {
    const ended = await prisma.participant.findFirst({
      where: { sessionTokenHash: hashSessionToken(sessionToken), type: 'anonymous' },
      select: { id: true },
    });
    if (ended) throw new GuestUploadAccessRevokedError();
    return null;
  }

  // #10440 — la garde du lien échu que `middleware/auth.ts` pose sur toute
  // requête REST d'un invité (#10437) : ce chemin ne la traverse pas. Même
  // lecture du lien (colonne, puis session embarquée), même règle, même cause
  // typée. #10492 — un lien introuvable refuse l'invité qui lui survit.
  // Une lecture qui échoue PROPAGE — fail-closed, jamais une identité servie.
  const shareLinkId = guestShareLinkId(participant) ?? '';
  if (shareLinkId) {
    const link = await prisma.conversationShareLink.findUnique({
      where: { id: shareLinkId },
      select: GUEST_SHARE_LINK_SELECT,
    });
    if (shareLinkHasExpired(link)) throw new ShareLinkExpiredError();
    // #10470 — la garde commune des autres portes : lien fermé, révocation
    // différée en attente pour un invité entré avant elle, ou invité banni.
    const end = guestAccessEnd({
      linkExpiresAt: null,
      linkIsActive: typeof link?.isActive === 'boolean' ? link.isActive : null,
      linkRevocationPendingAt: link?.guestRevocationPendingAt ?? null,
      linkMissing: link === null || link === undefined,
      participation: { isActive: true, bannedAt: participant.bannedAt ?? null, joinedAt: participant.joinedAt ?? null },
      now: new Date(),
    });
    if (end) throw new GuestUploadAccessRevokedError();
  }

  return { participantId: participant.id, shareLinkId };
}

/**
 * La cause TYPÉE d'un téléversement refusé à un invité dont l'accès est fini
 * (participation désactivée ou bannie, lien fermé ou disparu, révocation
 * différée) — traduite en 410 `GUEST_ACCESS_REVOKED`.
 */
export class GuestUploadAccessRevokedError extends Error {
  constructor() {
    super('Guest access revoked');
    this.name = 'GuestUploadAccessRevokedError';
  }
}

const GUEST_ACCESS_REVOKED_CODE = 'GUEST_ACCESS_REVOKED';

/** Le même refus que la résolution de session REST (`middleware/auth.ts`), tel que `@tus/server` le renvoie. */
export function guestAccessRevokedTusRefusal(): { readonly status_code: number; readonly body: string } {
  const envelope = {
    success: false,
    error: GUEST_ACCESS_REVOKED_CODE,
    message: "L'accès de cet invité a été retiré",
    code: GUEST_ACCESS_REVOKED_CODE,
  };
  return { status_code: 410, body: `${JSON.stringify(envelope)}\n` };
}

/**
 * Le refus d'un invité au lien échu tel que `@tus/server` le renvoie : le 403
 * `SHARE_LINK_EXPIRED` des autres portes, dans l'enveloppe d'erreur de l'API
 * (`sendError`), pour que les clients branchent le même code.
 */
export function shareLinkExpiredTusRefusal(): { readonly status_code: number; readonly body: string } {
  const reason = new ShareLinkExpiredError().message;
  const envelope = { success: false, error: reason, message: reason, code: SHARE_LINK_EXPIRED_CODE };
  return { status_code: 403, body: `${JSON.stringify(envelope)}\n` };
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
    select: GUEST_SHARE_LINK_SELECT,
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
