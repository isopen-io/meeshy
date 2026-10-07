/**
 * Copie les pièces jointes d'un message SOURCE vers un message CIBLE en
 * réutilisant les MÊMES fichiers (`filePath`/`fileUrl` identiques) : aucun
 * octet n'est ré-envoyé, aucun fichier n'est dupliqué sur le disque.
 *
 * Ce n'est PAS un transfert : diffuser un média à plusieurs destinataires ne
 * doit laisser AUCUNE marque de provenance chez aucun d'eux — ni
 * `forwardedFromId` sur le message (le badge « Transféré depuis … »
 * révélerait à un groupe le nom de la conversation d'un autre destinataire),
 * ni `forwardedFromAttachmentId` / `isForwarded` sur les pièces jointes.
 * Chacun reçoit un message DE PLEIN DROIT.
 *
 * Reprend les champs de `MessageProcessor.copyForwardedAttachments` par le
 * MÊME site (`copiedAttachmentFields` : chiffrement et protection de la pièce
 * compris), avec trois différences :
 * 1. contrôle de propriété AVANT toute lecture d'attachment (seul l'auteur
 *    du message source peut faire copier ses pièces jointes) ;
 * 2. aucune marque de transfert écrite (ni `forwardedFromAttachmentId`, ni
 *    `isForwarded`) ;
 * 3. AUCUN `catch` silencieux — `copyForwardedAttachments` avale ses
 *    erreurs (best-effort, un forward dégénère en message ordinaire) ; ici
 *    une copie manquée fait échouer l'envoi plutôt que de laisser une bulle
 *    vide, irrécupérable, chez tous les destinataires de la diffusion.
 *
 * ─── Le contrôle de propriété compare des IDENTITÉS, pas des LIGNES ────────
 *
 * `Message.senderId` est un `Participant.id`, et `Participant` est SCOPÉ par
 * conversation (`@@unique([conversationId, userId, sessionTokenHash])`). Le
 * cas d'usage de ce module EST la diffusion vers PLUSIEURS conversations :
 * pour une 2e cible, `requesterParticipantId` (résolu dans la conversation
 * CIBLE) et `source.senderId` (le participant de l'auteur dans la
 * conversation SOURCE) sont deux lignes `Participant` différentes du MÊME
 * utilisateur. Comparer les deux id bruts refuse alors TOUTE diffusion
 * au-delà de la première cible. La propriété se prouve par IDENTITÉ stable
 * (même `Participant.id` — cas mono-conversation — OU même `User.id` derrière
 * deux `Participant` distincts), même motif que
 * `MessageProcessor.resolveLinkAuthorUserId`. `requester.userId != null` est
 * une garde à part entière : un participant ANONYME n'a pas de `userId`
 * (`Participant.userId String?`), et l'omettre ferait de deux anonymes de
 * conversations différentes des propriétaires l'un de l'autre sur
 * `null === null`.
 *
 * ─── Une source sans pièce jointe est un refus, pas un no-op ───────────────
 *
 * `{ copied: 0 }` renvoyé silencieusement pour un id qui pointe un message
 * texte (ou dont les pièces jointes ont été balayées entre-temps) laisserait
 * l'appelant croire l'envoi réussi alors que le message créé est une bulle
 * vide diffusée à tous les destinataires. Refusé explicitement, comme tout
 * autre échec de copie (différence 3 ci-dessus).
 */

/**
 * Champs de la pièce jointe source lus pour construire la copie. Structural,
 * pas `PrismaClient` : le double de test reste trivial (même esprit que
 * `ForwardSourceReader` dans `AttachmentService.ts`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { discoverConversationIdsByMessageIds, withOrphanedSenderRepair } from './withOrphanedSenderRepair';

import { copiedAttachmentFields, type SourceAttachment } from './copiedAttachmentFields';

export type { SourceAttachment };

export interface CopyAttachmentsPrisma {
  message: {
    findUnique(args: {
      where: { id: string };
      select: { sender: { select: { id: true; userId: true } } };
    }): Promise<{ sender: { id: string; userId: string | null } } | null>;
  };
  participant: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; userId: true };
    }): Promise<{ id: string; userId: string | null } | null>;
  };
  messageAttachment: {
    findMany(args: { where: { messageId: string } }): Promise<readonly SourceAttachment[]>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export interface CopyAttachmentsParams {
  readonly sourceMessageId: string;
  readonly targetMessageId: string;
  readonly requesterParticipantId: string;
}

export async function copyAttachmentsFromMessage(
  prisma: CopyAttachmentsPrisma,
  params: CopyAttachmentsParams
): Promise<{ copied: number }> {
  // Le contrôle de propriété EXIGE `sender` : un expéditeur disparu fait donc
  // rejeter cette lecture (#6516), et la portée n'est connue qu'APRÈS —
  // `discoverConversationIdsByMessageIds` la découvre sans jamais
  // resélectionner `sender`. `prisma` n'est ici que la vue structurale
  // `CopyAttachmentsPrisma` (testabilité) ; le SEUL appelant de production
  // (`MessageProcessor`) lui passe le vrai client, dont la réparation a
  // réellement besoin — d'où le cast, local à ce module.
  const realPrisma = prisma as unknown as PrismaClient;
  const [source, requester] = await Promise.all([
    withOrphanedSenderRepair(
      { prisma: realPrisma, conversationIds: discoverConversationIdsByMessageIds(realPrisma, [params.sourceMessageId]) },
      () =>
        prisma.message.findUnique({
          where: { id: params.sourceMessageId },
          select: { sender: { select: { id: true, userId: true } } },
        })
    ),
    prisma.participant.findUnique({
      where: { id: params.requesterParticipantId },
      select: { id: true, userId: true },
    }),
  ]);

  const sender = source?.sender;
  const isOwner =
    !!sender &&
    !!requester &&
    (sender.id === requester.id ||
      (requester.userId != null && sender.userId === requester.userId));
  if (!isOwner) {
    throw new Error('copy-attachments:not-owner');
  }

  const sourceAttachments = await prisma.messageAttachment.findMany({
    where: { messageId: params.sourceMessageId },
  });

  if (sourceAttachments.length === 0) {
    throw new Error('copy-attachments:empty-source');
  }

  const created = await Promise.all(
    sourceAttachments.map((att) =>
      prisma.messageAttachment.create({
        data: {
          ...copiedAttachmentFields(att),
          messageId: params.targetMessageId,
          uploadedBy: params.requesterParticipantId,
        },
      })
    )
  );

  return { copied: created.length };
}
