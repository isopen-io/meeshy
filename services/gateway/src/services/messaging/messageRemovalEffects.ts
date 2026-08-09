import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'messageRemovalEffects' });

/**
 * TOUT ce qu'un retrait de message doit écrire en base, en un seul endroit.
 *
 * Quatre écrivains basculent `deletedAt` sur un `Message` — le handler socket,
 * `DELETE /messages/:id`, `DELETE /conversations/:id/messages/:id`, et le
 * balayage des messages vides de `MaintenanceService`. Aucune unité ne les
 * reliait : chacun tenait de mémoire une liste d'effets, et les listes avaient
 * divergé. Le recalcul de `lastMessageAt` manquait à la route empruntée par iOS
 * et par la vue web ; la désactivation des liens de partage manquait aux
 * quatre. C'est le jumeau d'`applyPostRemovalEffects`, pour la même raison et
 * après le même constat : un effet ajouté ici s'applique à tous les chemins.
 *
 * BEST-EFFORT, délibérément : quand ceci s'exécute, `deletedAt` est DÉJÀ
 * committé. Un lien récalcitrant ne doit jamais transformer une suppression
 * réussie en 500 — le message est retiré, c'est l'invariant qui compte pour la
 * personne qui a cliqué.
 */

/** Le message retiré, tel que les quatre chemins peuvent le rendre. */
export interface RemovedMessageRecord {
  id: string;
  conversationId: string;
  /** Le contenu AVANT le `translations: null` / `deletedAt` — il porte les `m+<token>`. */
  content?: string | null;
  /** `Json?` partagé ; seul `trackingLinks` est lu ici. */
  metadata?: unknown;
}

/**
 * Charset d'un token de partage (`generateShortToken`, plus les tokens
 * personnalisés acceptés par `createTrackingLink`). Sert deux fois : à ne
 * retenir que des tokens plausibles, et à garantir qu'aucun d'eux ne porte de
 * métacaractère avant d'entrer dans le `$regex` du préfiltre Mongo.
 */
const TOKEN_CHARSET = /^[A-Za-z0-9_-]{2,50}$/;

/** `m+<token>` tel que la réécriture des syntaxes explicites le laisse dans le contenu. */
const SHORT_LINK_PATTERN = /m\+([A-Za-z0-9_-]{2,50})/gi;

/**
 * Les tokens qu'un contenu porte EN CLAIR (`[[url]]` et `<url>` réécrits en
 * `m+<token>` par `processExplicitLinks`).
 */
function tokensInContent(content: string | null | undefined): string[] {
  if (!content) return [];
  SHORT_LINK_PATTERN.lastIndex = 0;
  return [...content.matchAll(SHORT_LINK_PATTERN)].map((match) => match[1]);
}

/**
 * Les tokens rangés dans `metadata.trackingLinks` — l'AUTRE représentation, et
 * la seule pour une URL brute, dont le contenu n'est justement jamais réécrit.
 * Les deux sont nécessaires : un message peut ne porter ses tokens que dans
 * l'une ou l'autre.
 */
function tokensInMetadata(metadata: unknown): string[] {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const links = (metadata as Record<string, unknown>).trackingLinks;
  if (!Array.isArray(links)) return [];
  return links
    .map((link) =>
      link !== null && typeof link === 'object' ? (link as Record<string, unknown>).token : undefined
    )
    .filter((token): token is string => typeof token === 'string');
}

/** Les deux représentations réunies, dédupliquées, débarrassées de l'improbable. */
export function trackingTokensOfMessage(message: RemovedMessageRecord): string[] {
  const all = [...tokensInContent(message.content), ...tokensInMetadata(message.metadata)];
  return [...new Set(all)].filter((token) => TOKEN_CHARSET.test(token));
}

/** Ce que le préfiltre Mongo rend, réduit à ce dont le décompte a besoin. */
interface SurvivorDocument {
  content?: unknown;
  metadata?: { trackingLinks?: Array<{ token?: unknown }> };
}

/**
 * Les tokens qu'un AUTRE message vivant de la même conversation porte encore.
 *
 * C'est la question que `messageId` ne peut pas trancher — voir
 * `deactivateOrphanedTrackingLinks`. La requête Mongo n'est qu'un PRÉFILTRE
 * volontairement large (`m\+(t1|t2)` sans frontière de mot attrape aussi
 * `m+t1x`) : le décompte exact se fait en JS sur les documents rendus. Un
 * préfiltre trop large ne coûte que des lignes lues ; un préfiltre trop étroit
 * désactiverait un lien encore affiché, et c'est le seul sens dans lequel une
 * erreur ici est grave.
 */
async function tokensStillReferenced(
  prisma: PrismaClient,
  message: RemovedMessageRecord,
  tokens: string[]
): Promise<Set<string>> {
  const survivors = (await prisma.message.findRaw({
    filter: {
      conversationId: { $oid: message.conversationId },
      deletedAt: null,
      _id: { $ne: { $oid: message.id } },
      $or: [
        { 'metadata.trackingLinks.token': { $in: tokens } },
        { content: { $regex: `m\\+(${tokens.join('|')})` } },
      ],
    },
    options: {
      projection: { content: 1, 'metadata.trackingLinks.token': 1 },
    },
  })) as unknown as SurvivorDocument[];

  const referenced = new Set<string>();
  for (const survivor of survivors) {
    const content = typeof survivor.content === 'string' ? survivor.content : null;
    for (const token of [...tokensInContent(content), ...tokensInMetadata(survivor.metadata)]) {
      referenced.add(token);
    }
  }
  return referenced;
}

/**
 * Les `/l/<token>` que ce message emporte avec lui — et EUX SEULS.
 *
 * Le soft-delete ne bascule que `deletedAt` ; aucune cascade Prisma ne se
 * déclenche. Un message retiré gardait donc ses liens courts opérationnels, et
 * ils continuaient de compter des clics vers un contenu effacé.
 *
 * Mais `TrackingLink.messageId` NE DÉSIGNE PAS le propriétaire, et c'est tout
 * l'enjeu : `findExistingTrackingLink(url, conversationId)` REND À TOUT MESSAGE
 * de la conversation le lien déjà minté pour la même URL. Une ligne est donc
 * PARTAGÉE, et `messageId` n'en retient qu'un seul message — le premier à
 * l'avoir réclamée par le chemin d'envoi (`updateTrackingLinksWithMessageId`
 * filtre sur `messageId: null`), le dernier par le chemin de partage
 * (`updateTrackingLinksMessageId` écrase sans garde). Désactiver
 * `where: { messageId }` couperait donc le lien que d'AUTRES messages toujours
 * affichés portent encore — et sur le chemin d'envoi, qui est le cas courant,
 * c'est exactement ce qui arriverait en supprimant le premier message d'une URL
 * citée deux fois.
 *
 * D'où les trois gardes, chacune fermant un faux positif distinct :
 *
 * 1. **`targetType: 'EXTERNAL'`** — un lien `POST`/`REEL`/`STORY`/`STATUS`
 *    appartient au contenu partagé, pas au message qui le relaie ; son retrait
 *    est déjà tenu par `applyPostRemovalEffects`. Supprimer le message qui
 *    partage un post ne doit pas casser le partage de ce post ailleurs.
 * 2. **`conversationId`** — un `m+<token>` recopié à la main depuis une autre
 *    conversation ne donne aucun droit sur le lien d'en face.
 * 3. **Plus aucun message vivant ne le porte** — la seule question qui décide
 *    vraiment, et celle à laquelle la colonne `messageId` ne répond pas.
 */
async function deactivateOrphanedTrackingLinks(
  prisma: PrismaClient,
  message: RemovedMessageRecord
): Promise<void> {
  const tokens = trackingTokensOfMessage(message);
  if (tokens.length === 0) return;

  const referenced = await tokensStillReferenced(prisma, message, tokens);
  const orphaned = tokens.filter((token) => !referenced.has(token));
  if (orphaned.length === 0) return;

  await prisma.trackingLink.updateMany({
    where: {
      token: { in: orphaned },
      targetType: 'EXTERNAL',
      conversationId: message.conversationId,
      isActive: true,
    },
    data: { isActive: false },
  });
}

/**
 * `lastMessageAt` ramené au dernier message VIVANT de la conversation.
 *
 * Sans ce recalcul, la liste des conversations reste triée sur l'horodatage
 * d'un message que plus personne ne peut voir. Deux des trois chemins de
 * suppression le faisaient déjà, mot pour mot ; celui qu'empruntent iOS et la
 * vue web ne le faisait pas.
 *
 * Écriture conditionnelle (CAS) : la garde `lastMessageAt` relit la valeur
 * juste avant d'écrire, et l'écriture n'a lieu que si personne ne l'a bougée
 * entretemps. Un `message:new` qui commit pendant ce calcul fait donc échouer
 * la garde plutôt que de faire RECULER le curseur sur le message supprimé.
 *
 * Exporté séparément parce que le balayage des messages vides
 * (`MaintenanceService`) retire en LOT : il n'a que cet effet-là à appliquer,
 * une fois par conversation touchée, et non une fois par message.
 */
export async function recomputeConversationLastMessageAt(
  prisma: PrismaClient,
  conversationId: string
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { lastMessageAt: true, createdAt: true },
  });
  if (!conversation) return;

  const lastAlive = await prisma.message.findFirst({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  await prisma.conversation.updateMany({
    where: { id: conversationId, lastMessageAt: conversation.lastMessageAt },
    data: { lastMessageAt: lastAlive?.createdAt ?? conversation.createdAt },
  });
}

export async function applyMessageRemovalEffects(
  prisma: PrismaClient,
  message: RemovedMessageRecord
): Promise<void> {
  try {
    await deactivateOrphanedTrackingLinks(prisma, message);
  } catch (err) {
    // Échouer ICI laisse le lien ACTIF : c'est le sens sûr. Le couper à tort
    // casserait un message vivant, et rien ne le rouvrirait.
    log.warn('message removal: tracking link deactivation failed', { messageId: message.id, err });
  }

  try {
    await recomputeConversationLastMessageAt(prisma, message.conversationId);
  } catch (err) {
    log.warn('message removal: lastMessageAt recompute failed', {
      messageId: message.id,
      conversationId: message.conversationId,
      err,
    });
  }
}
