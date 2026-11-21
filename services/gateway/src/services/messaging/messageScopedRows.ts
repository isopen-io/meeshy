/**
 * Ce qui PEND à un message, et qu'aucune cascade n'emporte.
 *
 * Sur MongoDB, Prisma n'a de cascade que pour les relations DÉCLARÉES — et
 * neuf de ces dix tables ne déclarent qu'un `messageId String @db.ObjectId`
 * nu, sans `@relation`. Supprimer une ligne `Message` ne les touche donc pas :
 * elles s'effacent à la main, avant elle.
 *
 * Le purgeur de conversation obsolète le savait et portait seul cette liste
 * (`jobs/obsolete-conversation-purge.ts`). Elle vit ici parce qu'un SECOND site
 * en a besoin — l'abandon d'un message dont les pièces n'ont pas pu être liées
 * (`attachmentFailureOutcome.ts`, #19956) — et qu'une liste de tables recopiée
 * est une liste qui divergera : celui qui ajoute une table « qui pend à un
 * message » la posera dans l'inventaire qu'il a sous les yeux, pas dans les
 * deux.
 *
 * **`MessageEnvelope` est celle qui coûte le plus cher à oublier.** Sur le
 * chemin libsignal par appareil (conversation hybride, `deviceLayerRelay`), les
 * enveloppes sont écrites AVEC la ligne, dans la même transaction, puis
 * DIFFUSÉES immédiatement (`e2eeEnvelopePersistence.ts`,
 * `e2ee/envelope-delivery.ts`) — tout cela AVANT que les pièces jointes ne
 * soient liées. Supprimer la ligne sans elles laisse des enveloppes orphelines
 * que `GET /e2ee/envelopes` continue de servir jusqu'à l'accusé ou la rétention,
 * et le rejeu en produit un second jeu pour le même clair.
 */

export const MESSAGE_SCOPED_MODELS = [
  'attachmentReaction',
  'attachmentStatusEntry',
  'reaction',
  'mention',
  'messageStatusEntry',
  'userMessageDeletion',
  'messageStar',
  'sharedTranslation',
  'messageEnvelope',
  'notification',
] as const;

export type MessageScopedModel = (typeof MESSAGE_SCOPED_MODELS)[number];

export type MessageScopedDelegate = {
  deleteMany(args: { where: Record<string, unknown> }): Promise<unknown>;
};

export type MessageScopedPrisma = { readonly [K in MessageScopedModel]: MessageScopedDelegate };

/** Les délégués des dix tables, dans l'ordre de la liste. */
export const messageScopedDelegates = (prisma: MessageScopedPrisma): readonly MessageScopedDelegate[] =>
  MESSAGE_SCOPED_MODELS.map((model) => prisma[model]);

/**
 * Efface ce qui pend à UN message. Chaque suppression est isolée : une table
 * qui résiste ne doit pas retenir les neuf autres — notamment pas
 * `messageEnvelope`, la seule dont une orpheline est SERVIE.
 */
export async function deleteMessageScopedRows(
  prisma: MessageScopedPrisma,
  input: { readonly messageId: string; readonly onError: (model: MessageScopedModel, error: unknown) => void }
): Promise<void> {
  for (const model of MESSAGE_SCOPED_MODELS) {
    // `try/catch` ET `await`, pas un `.catch` seul : un délégué ABSENT lève
    // SYNCHRONEMENT (`TypeError`), avant qu'il n'existe de promesse à garder —
    // et l'exception remplacerait alors l'erreur d'origine, la seule qui porte
    // la cause de l'abandon. Les deux gardes sont disjointes (cf. la règle
    // `void p` du `CLAUDE.md` du gateway, lue dans l'autre sens).
    try {
      await prisma[model].deleteMany({ where: { messageId: input.messageId } });
    } catch (error) {
      input.onError(model, error);
    }
  }
}
