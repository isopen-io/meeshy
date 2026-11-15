/**
 * **L'écriture IDEMPOTENTE d'un message envoyé par lien de partage** (#18617).
 *
 * Tout l'édifice d'idempotence de l'envoi converge sur
 * `MessageProcessor.saveMessage` : `INSERT` direct, `catch P2002`, relecture de
 * la ligne EXISTANTE, et un drapeau `isDuplicate` que les appelants lisent pour
 * sauter la re-diffusion. **La surface d'envoi par lien y échappait** — elle
 * écrivait en direct, sans `catch`, et la branche terminale de son gestionnaire
 * rend 500.
 *
 * Le commentaire qui l'exemptait promettait ce qui n'existe pas :
 *
 * > « Pas de catch-P2002 ici (chemin anonyme simple) — un retry serveur produit
 * > le même cid donc Prisma renvoie une 409 que la couche Fastify mappe en
 * > réponse 409 Conflict côté client. »
 *
 * Mesuré : le `create` vivait dans le `try` du gestionnaire, dont la branche
 * terminale est `sendInternalError`. Aucun mappeur Fastify n'était atteint, et
 * le bloc `response:` de la route ne déclarait même pas de 409. C'est une
 * AFFIRMATION, et elle se vérifie comme telle (§ « un commentaire qui ÉNONCE
 * une contrainte ») — celle-ci a dispensé la surface d'une garde pendant toute
 * sa vie.
 *
 * ## Pourquoi RENDRE le message, et pas un 409
 *
 * Le `clientMessageId` est OBLIGATOIRE sur cette surface, donc un renvoi touche
 * l'index unique partiel à coup sûr : le verdict n'est pas un cas limite, c'est
 * la réponse garantie. Et aucun des deux clients qui savent renvoyer ne sait
 * lire un conflit comme un succès :
 *
 * | client | ce qu'il fait d'un échec non terminal | état final |
 * |---|---|---|
 * | iOS | 5 tentatives (2/4/8/16/30 s) | `.exhausted` — bulle en échec À VIE |
 * | web | `neverReachedServer` faux ⇒ aucun rejeu auto | bloquée sur « Réessayer » |
 *
 * Rendre la ligne existante est la seule réponse qui débloque les deux SANS
 * changer un contrat client — et c'est exactement ce que le chemin canonique
 * rend déjà.
 */

import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * La projection que les DEUX chemins servent — l'écriture neuve et la
 * relecture du renvoi.
 *
 * Elle est NOMMÉE plutôt que recopiée, et pour la raison que
 * `messageDedupProjection.ts` écrit déjà sur son propre exemplaire : deux
 * copies rigoureusement identiques sont la paire qui finit par diverger, sur le
 * champ qu'un seul des chemins gagne. Ici le risque est précis — `sender.language`
 * est servi par le 201 et absent de la projection partagée de
 * `findExistingMessage`, si bien que relire par celle-ci aurait servi un
 * expéditeur SANS sa langue au seul chemin du renvoi, sans qu'un témoin tombe.
 */
export const LINK_MESSAGE_WRITE_INCLUDE = {
  sender: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      avatar: true,
      type: true,
      language: true,
      user: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
        },
      },
    },
  },
} as const;

/**
 * La ligne telle que les deux chemins la servent, typée par la projection
 * elle-même : la forme ne peut pas dériver du `include` sans que le
 * compilateur le dise.
 */
export type LinkMessageRow = Prisma.MessageGetPayload<{ include: typeof LINK_MESSAGE_WRITE_INCLUDE }>;

/** Ce que l'écriture rend : la ligne, et si elle était DÉJÀ là. */
export type LinkMessageWrite = {
  readonly row: LinkMessageRow;
  /**
   * `true` ⇒ la première tentative a déjà tout fait. L'appelant doit sauter
   * TOUT ce qui a un EFFET — mentions, effets post-sauvegarde, notification,
   * diffusion — et ne garder que ce qui COMPOSE la réponse. Rediffuser
   * afficherait le message deux fois chez tous les participants.
   */
  readonly isDuplicate: boolean;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Écrit le message, ou retrouve celui que le même `clientMessageId` a déjà
 * écrit.
 *
 * La relecture passe par `findFirst` et non `findUnique`, pour la raison que le
 * chemin canonique écrit déjà : la contrainte unique sur
 * `(conversationId, clientMessageId)` vit dans un index partiel MongoDB géré
 * par une migration manuelle, pas dans une directive Prisma `@@unique` — le
 * type composite de `findUnique` n'est donc pas généré.
 *
 * **Une relecture qui ne trouve rien RELANCE l'erreur d'origine.** C'est une
 * course qu'on ne sait pas réconcilier, et la sortie est celle du chemin
 * canonique, mot pour mot. Servir un 201 dont le corps ne décrit aucun message
 * serait pire que le 500 qu'on corrige : le client rangerait comme « envoyé »
 * un message dont il n'a pas l'identifiant.
 */
export async function writeLinkMessageIdempotently(params: {
  readonly prisma: Pick<PrismaClient, 'message'>;
  readonly data: Prisma.MessageUncheckedCreateInput;
  readonly conversationId: string;
  readonly clientMessageId?: string | null;
}): Promise<LinkMessageWrite> {
  const { prisma, data, conversationId, clientMessageId } = params;

  try {
    const row = await prisma.message.create({ data, include: LINK_MESSAGE_WRITE_INCLUDE });
    return { row, isDuplicate: false };
  } catch (error) {
    if (!isUniqueViolation(error) || !clientMessageId) throw error;

    const existing = await prisma.message.findFirst({
      where: { conversationId, clientMessageId },
      include: LINK_MESSAGE_WRITE_INCLUDE,
    });
    if (!existing) throw error;

    return { row: existing, isDuplicate: true };
  }
}
