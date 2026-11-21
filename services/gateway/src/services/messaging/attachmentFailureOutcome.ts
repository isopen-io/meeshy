/**
 * #19956 — ce qu'un échec de pièce jointe fait du message DÉJÀ ÉCRIT.
 *
 * `MessageProcessor.saveMessage` crée la ligne `Message` AVANT de lier ses
 * pièces. Un échec laissé sous un `catch` qui journalise rend donc l'envoi
 * « réussi » sur une bulle VIDE — et le rejeu au même `clientMessageId` la
 * CONFIRME en dédup, le chemin de dédoublonnage retournant AVANT la liaison
 * (`saveMessage`, branche `isDuplicate`). La bulle vide est alors définitive.
 *
 * Les trois issues ne sont pas les mêmes, et c'est pour cela que cette règle
 * vit ici plutôt qu'en commentaire sur la branche qui l'a inventée :
 *
 * | ce qui lève | verdict | pourquoi |
 * |---|---|---|
 * | la LIAISON de pièces pré-téléversées | `discardMessageAfterLinkFailure` | rien n'est attaché : l'envoi doit ÉCHOUER et rendre le `clientMessageId` |
 * | la COPIE d'une diffusion | `discardMessageAfterCopyFailure` | idem, sans libération : les lignes recopiées naissent avec le message |
 * | le SCELLEMENT au repos APRÈS une liaison réussie | `sealLinkedFilesAtRest` | les pièces SONT liées — les orpheliner serait pire — et le scellement déclare son propre rattrapage idempotent |
 *
 * **Ce qui sépare les deux premières lignes est la LIBÉRATION.** Une pièce
 * pré-téléversée ne se relie qu'à partir d'un `messageId` nul ou absent
 * (`unsetOrNull`, dans `AttachmentService.associateAttachmentsToMessage`), et
 * cette unité écrit une pièce PAR REQUÊTE : un échec au milieu du lot laisse
 * les premières liées, donc INÉLIGIBLES au rejeu. Sans libération, la reprise
 * reconstruirait un message AMPUTÉ, en silence — un état pire que l'échec
 * bruyant qu'on vient de rendre. Les rendre à l'état non lié est ce qui fait
 * de la reprise un chemin NOMINAL complet : liaison, scellement au repos,
 * départ de l'audio, type dérivé des pièces.
 *
 * **Abandonner un message n'est pas supprimer sa LIGNE.** Ce qui pend à lui
 * s'efface d'abord (`messageScopedRows.ts`) : neuf de ces dix tables ne
 * déclarent qu'un `messageId` nu, sans relation, donc aucune cascade ne les
 * emporte. `MessageEnvelope` est celle qui compte ici — sur le chemin
 * libsignal par appareil (hybride + `deviceLayerRelay`, admis AVEC des pièces
 * jointes), les enveloppes sont écrites avec la ligne et **diffusées** avant
 * que les pièces ne soient liées. « L'envoi échoue » serait faux sur le fil si
 * on les laissait : le chiffré est déjà chez le destinataire, et le rejeu lui
 * en livrerait un second jeu pour le même clair.
 *
 * **Et le nettoyage n'est sûr que parce que le LINKER attend toutes ses
 * écritures.** `associateAttachmentsToMessage` en lance une par pièce ; tant
 * qu'il rejetait par `Promise.all`, les retardataires couraient contre la
 * libération et re-liaient une pièce au message qu'on supprimait. Il settle
 * désormais avant de propager (#19956) — sans quoi tout ce qui suit est une
 * course, pas une garantie.
 *
 * **Ce que la libération rend, et ce qu'elle ne rend pas (#19971).** Une liaison
 * partielle a pu écrire, en même temps que le `messageId`, les drapeaux de
 * protection du message (`isViewOnce`, `isBlurred`, `effectFlags`, OR-és sur
 * les flags portés). Elle les rend donc AUSSI — et le paragraphe qui vivait ici
 * disait le contraire, sur une prémisse mesurée FAUSSE : « leur état d'AVANT la
 * liaison n'est connu de personne ».
 *
 * Il est connu, et c'est le DÉFAUT DU SCHÉMA. `associateAttachmentsToMessage`
 * est le SEUL écrivain de production de ces trois colonnes (relevé : aucune des
 * quatre créations de ligne `MessageAttachment` ne les pose — les deux de
 * `UploadProcessor`, celle de `tus-handler`, celle de `copyAttachments` —, et
 * aucun autre `update` ne les touche), et `schema.prisma` les déclare NON
 * nullables : `isViewOnce Boolean @default(false)`,
 * `isBlurred Boolean @default(false)`, `effectFlags Int @default(0)`.
 *
 * Ce que la libération d'avant #19971 coûtait : une photo envoyée en VUE UNIQUE
 * dont la liaison lève ressortait `isViewOnce: true` persistant. Recomposée
 * SANS vue unique depuis la même pièce téléversée, elle arrivait à vue unique
 * sous une bulle ordinaire — la protection de la PIÈCE contredisant celle du
 * MESSAGE, ce que #7498 avait fermé dans l'autre sens. Le sens de l'erreur
 * était « plus protégé que demandé », donc fail-closed ; c'est ce qui en a fait
 * une issue à part plutôt qu'un bug de #19956, pas une raison de la laisser.
 *
 * Le `rank` n'est PAS rendu, et c'est la bonne réponse : la prochaine
 * association le réécrit inconditionnellement pour tous les ids de son lot, il
 * ne peut donc pas contredire le message qui reprend la pièce.
 *
 * **Et le scellement ne descend PAS avec eux.** La suppression du message
 * rendrait orphelines des lignes `MessageAttachment` qui portent, elles, des
 * fichiers bien réels ; et `sealMessageAttachments.ts` énonce déjà le régime
 * de son propre échec — « un échec de scellement n'efface rien et ne bloque
 * pas l'envoi déjà écrit […] la migration de rattrapage, idempotente, le
 * rejoue ». Ce que l'isolement ajoute est que l'échec n'emporte plus ce qui le
 * SUIT : le départ de l'audio vit sous le même `try` que le scellement, et
 * une transcription manquée, elle, n'a AUCUN rattrapage.
 *
 * Les deux écritures de nettoyage sont `.catch`ées : elles ne masquent jamais
 * l'erreur d'origine, qui est la seule à porter la cause.
 */
import { enhancedLogger } from '../../utils/logger-enhanced';
import { SERVER_AT_REST_FILE_SEAL_FAILED } from './sealMessageAttachments';
import { deleteMessageScopedRows, type MessageScopedPrisma } from './messageScopedRows';

const logger = enhancedLogger.child({ module: 'attachmentFailureOutcome' });

/** La part de Prisma qu'un abandon de message touche — structurale, pour être doublée telle quelle. */
export type AttachmentFailurePrisma = MessageScopedPrisma & {
  readonly message: { delete(args: { where: { id: string } }): Promise<unknown> };
  readonly messageAttachment: {
    /**
     * #19971 — la forme de la libération est DANS le type : les trois colonnes
     * de protection sont REQUISES, donc une libération qui n'en rendrait qu'une
     * partie ne compile pas. C'est la seule garde qu'un double de test ne peut
     * pas simuler — un mock accepte ce qu'on lui donne.
     */
    updateMany(args: {
      where: { messageId: string };
      data: { messageId: null; isViewOnce: false; isBlurred: false; effectFlags: 0 };
    }): Promise<unknown>;
  };
};

const reasonOf = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

/**
 * Abandonner un message, c'est effacer ce qui PEND à lui AVANT sa ligne —
 * `MessageEnvelope` en tête, qui n'a aucune relation Prisma donc aucune
 * cascade, et dont les copies sont DÉJÀ parties sur le fil quand on arrive ici.
 * Les neuf autres tables ne peuvent pas encore porter de ligne à ce point du
 * `saveMessage` (mentions et notifications sont l'étape 6) : c'est
 * l'ÉNUMÉRATION qui tient dans le temps, pas le fait qu'elle soit vide
 * aujourd'hui.
 */
async function deleteMessageRow(prisma: AttachmentFailurePrisma, messageId: string, stage: string): Promise<void> {
  await deleteMessageScopedRows(prisma, {
    messageId,
    onError: (model, error) =>
      logger.error('ligne pendante non effacée avant l’abandon du message', undefined, {
        messageId,
        stage,
        model,
        reason: reasonOf(error),
      }),
  });
  await prisma.message.delete({ where: { id: messageId } }).catch((error: unknown) =>
    logger.error('message orphelin non supprimé après un échec de pièce jointe', undefined, {
      messageId,
      stage,
      reason: reasonOf(error),
    })
  );
}

/**
 * La LIAISON des pièces pré-téléversées a levé : rendre les pièces déjà liées
 * à l'état non lié, puis supprimer le message. L'appelant propage l'erreur.
 */
export async function discardMessageAfterLinkFailure(
  prisma: AttachmentFailurePrisma,
  input: { readonly messageId: string }
): Promise<void> {
  await prisma.messageAttachment
    .updateMany({
      where: { messageId: input.messageId },
      // #19971 — la PROTECTION part avec le `messageId`. Voir le § « Ce que la
      // libération rend » ci-dessus : l'association est le seul écrivain de ces
      // trois colonnes, donc leur état d'avant liaison est le DÉFAUT du schéma,
      // et une pièce rendue ne peut plus contredire le message qui la reprend.
      data: { messageId: null, isViewOnce: false, isBlurred: false, effectFlags: 0 },
    })
    .catch((error: unknown) =>
      logger.error('pièces pré-téléversées non libérées après un échec de liaison : le rejeu les manquera', undefined, {
        messageId: input.messageId,
        reason: reasonOf(error),
      })
    );
  await deleteMessageRow(prisma, input.messageId, 'link');
}

/**
 * La COPIE d'une diffusion a levé : supprimer le message, sans rien libérer —
 * les lignes recopiées sont CRÉÉES pour lui et n'ont pas d'autre vie.
 */
export async function discardMessageAfterCopyFailure(
  prisma: AttachmentFailurePrisma,
  input: { readonly messageId: string }
): Promise<void> {
  await deleteMessageRow(prisma, input.messageId, 'copy');
}

/**
 * Le scellement au repos, isolé : il ne fait pas échouer l'envoi (les pièces
 * sont liées, le rattrapage le rejoue) et il n'emporte pas ce qui le suit.
 */
export async function sealLinkedFilesAtRest(
  seal: () => Promise<void>,
  input: { readonly messageId: string }
): Promise<void> {
  try {
    await seal();
  } catch (error) {
    logger.error('pièces liées non scellées au repos : le balayage de rattrapage les reprendra', undefined, {
      code: SERVER_AT_REST_FILE_SEAL_FAILED,
      messageId: input.messageId,
      reason: reasonOf(error),
    });
  }
}
