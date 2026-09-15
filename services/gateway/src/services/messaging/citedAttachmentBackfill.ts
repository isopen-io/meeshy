/**
 * #6164 — LA PIÈCE NOMMÉE QUI TOMBE HORS DE LA FENÊTRE DE LA CITATION.
 *
 * Le `select` de `replyTo` ne charge que quatre pièces jointes ; répondre à la
 * cinquième photo d'un carrousel est parfaitement licite. Monter le `take` à 10
 * ferait payer chaque message du fil, pour tous les lecteurs, afin qu'une
 * citation sur mille en rende une de plus : on va donc CHERCHER la pièce
 * nommée, par son identifiant, en UNE requête pour toute la page.
 *
 * FAIL-CLOSED en deux temps : la garde d'ENVOI refuse déjà un `attachmentId`
 * étranger au message cité ; ici on revérifie l'appartenance sur la ligne
 * relue, parce qu'une garde d'écriture ne dit rien des lignes écrites AVANT
 * elle. Et le masquage passe par le site UNIQUE (`servedQuotedAttachments`),
 * qui reçoit LE MESSAGE CITÉ : une pièce rattrapée est soumise aux deux niveaux
 * de protection — celui du MESSAGE et celui de la PIÈCE — comme n'importe
 * quelle autre. Les deux propriétés ont leur témoin de COMPORTEMENT dans
 * `__tests__/unit/services/attachment-reply-citation.test.ts` : les greps qui
 * les gardaient auparavant sont restés verts sur un correctif annulé.
 *
 * **CE QUE CE RATTRAPAGE ÉLARGISSAIT, et qui est fermé depuis #6601.** Les deux
 * gardes d'envoi (`admitAttachmentReply`) lient désormais la pièce au MESSAGE
 * CITÉ **et** le message cité à la conversation qu'on LIT — `replyToId` est
 * validé contre la conversation de l'envoi au même site. Ce module lisait déjà
 * une pièce PAR SON ID, donc hors de la fenêtre `take: 4` qui la plafonnait
 * avant lui ; il ne peut désormais plus rattraper une pièce dont le message
 * cité n'appartenait pas à cette conversation, puisque l'envoi qui l'aurait
 * produite est refusé en amont.
 *
 * Une pièce SUPPRIMÉE n'est simplement pas rattrapée : la citation garde son
 * ancre et sa nature (« une photo »), et ne se vide pas.
 *
 * Extrait de `messages-list-query.ts` (957 lignes avant ce lot) plutôt
 * qu'ajouté dedans : la directive du 2026-09-02 place à 1 000 lignes le seuil
 * au-delà duquel un découpage se justifie sans se discuter, et « rattraper une
 * pièce citée » est une responsabilité, pas une tranche.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { attachmentFullSelect } from '../attachments/attachmentIncludes';
import { servedQuotedAttachments, type QuotedMessageRow } from './servedQuotedMessage';

/**
 * La forme MINIMALE que ce module LIT et MUTE, sur une charge déjà sérialisée.
 * Elle étend `QuotedMessageRow` — ce que `servedQuotedAttachments` exige — des
 * deux seuls champs que le rattrapage touche. Déclarer la forme plutôt que de
 * la contourner par `any` garde la garde d'appartenance (`piece.messageId !==
 * m.replyTo?.id`) sous le regard du compilateur : c'est elle qui est
 * fail-closed, et un `any` la rendrait muette au premier renommage.
 */
type CitationRattrapable = QuotedMessageRow & {
  attachments?: readonly unknown[];
  readonly attachmentReplyTo?: { readonly attachmentId?: unknown } | null;
};

/**
 * Ouverte par l'index : un message servi porte des dizaines de champs que ce
 * module ne lit pas. Ce qui est DÉCLARÉ est ce qu'il touche — le reste passe
 * en `unknown`, jamais en `any`, pour que rien ne s'y lise par accident.
 */
export type MessageRattrapable = {
  readonly replyTo?: CitationRattrapable | null;
  readonly [autreChamp: string]: unknown;
};

export async function backfillCitedAttachments(
  prisma: PrismaClient,
  mappedMessages: readonly MessageRattrapable[]
): Promise<void> {
  const attendues = new Map<string, MessageRattrapable[]>();
  for (const m of mappedMessages) {
    const citee = m?.replyTo?.attachmentReplyTo?.attachmentId;
    if (typeof citee !== 'string' || citee.length === 0) continue;
    const dejaServie = Array.isArray(m.replyTo.attachments)
      && m.replyTo.attachments.some(
        (a) => (a as { id?: unknown } | null)?.id === citee
      );
    if (dejaServie) continue;
    attendues.set(citee, [...(attendues.get(citee) ?? []), m]);
  }
  if (attendues.size === 0) return;

  const pieces = await prisma.messageAttachment.findMany({
    where: { id: { in: [...attendues.keys()] } },
    select: attachmentFullSelect,
  });
  const parId = new Map(pieces.map((p) => [p.id, p] as const));

  for (const [attachmentId, messages] of attendues) {
    const piece = parId.get(attachmentId);
    if (!piece) continue;
    for (const m of messages) {
      if (piece.messageId !== m.replyTo?.id) continue;
      const servies = Array.isArray(m.replyTo.attachments) ? m.replyTo.attachments : [];
      // La charge servie est mutable en pratique : `readonly` déclare ici ce que
      // le module PROMET de ne pas remplacer ailleurs, pas une immuabilité runtime.
      (m.replyTo as { attachments?: readonly unknown[] }).attachments = [
        ...servies,
        ...servedQuotedAttachments(m.replyTo, [piece]),
      ];
    }
  }
}
