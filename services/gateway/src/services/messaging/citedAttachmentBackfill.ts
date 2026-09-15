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
 * **CE QUE CE RATTRAPAGE ÉLARGIT (#6601).** Les deux gardes lient la pièce au
 * MESSAGE CITÉ ; aucune ne lie le message cité à la conversation qu'on LIT —
 * `replyToId` n'est validé contre aucune conversation dans le chemin d'envoi.
 * Le trou PRÉEXISTE à ce module, mais celui-ci l'élargit : il va chercher une
 * pièce PAR SON ID, donc hors de la fenêtre `take: 4` qui le plafonnait jusque-là.
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

type CitingReply = QuotedMessageRow & {
  readonly attachmentReplyTo?: { readonly attachmentId?: unknown } | null;
};

type Attachable = { attachments?: unknown };

const citingReplyOf = (message: unknown): CitingReply | null => {
  if (typeof message !== 'object' || message === null || !('replyTo' in message)) return null;
  const { replyTo } = message;
  return typeof replyTo === 'object' && replyTo !== null ? replyTo : null;
};

const carriesId = (value: unknown, id: string): boolean =>
  typeof value === 'object' && value !== null && 'id' in value && value.id === id;

export async function backfillCitedAttachments(
  prisma: PrismaClient,
  mappedMessages: readonly unknown[]
): Promise<void> {
  const attendues = new Map<string, CitingReply[]>();
  for (const message of mappedMessages) {
    const reply = citingReplyOf(message);
    const citee = reply?.attachmentReplyTo?.attachmentId;
    if (!reply || typeof citee !== 'string' || citee.length === 0) continue;
    const dejaServie = Array.isArray(reply.attachments)
      && reply.attachments.some((attachment: unknown) => carriesId(attachment, citee));
    if (dejaServie) continue;
    attendues.set(citee, [...(attendues.get(citee) ?? []), reply]);
  }
  if (attendues.size === 0) return;

  const pieces = await prisma.messageAttachment.findMany({
    where: { id: { in: [...attendues.keys()] } },
    select: attachmentFullSelect,
  });
  const parId = new Map(pieces.map((piece) => [piece.id, piece] as const));

  for (const [attachmentId, replies] of attendues) {
    const piece = parId.get(attachmentId);
    if (!piece) continue;
    for (const reply of replies) {
      if (piece.messageId !== reply.id) continue;
      const servies = Array.isArray(reply.attachments) ? reply.attachments : [];
      const attachable: Attachable = reply;
      attachable.attachments = [...servies, ...servedQuotedAttachments(reply, [piece])];
    }
  }
}
