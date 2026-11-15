import {
  ensureIndexesByCommand,
  type BootIndexOutcome,
  type IndexSpec,
  type RawCommandRunner,
} from '../social/socialEventIndexes';

/**
 * **L'index unique PARTIEL dont tout le contrat d'idempotence d'envoi dépend**
 * (#18621).
 *
 * L'unicité de `(conversationId, clientMessageId)` est la SEULE chose qui ferme
 * la fenêtre de concurrence du dedup. Le dépôt la documente sur place
 * (`MessageProcessor`) : « deux requêtes concurrentes avec le même
 * clientMessageId passent toutes les deux le findUnique avant que l'une
 * INSERT ». Sans contrainte réelle, le `catch` Prisma P2002 qui devait
 * rattraper la seconde ne se déclenche jamais, et le repli « même contenu sous
 * 2 s » ne peut pas aider — il rend `false` dès qu'il y a une pièce jointe.
 *
 * ─── Pourquoi il n'est PAS dans le schéma, et c'est juste ────────────────────
 *
 * `schema.prisma` décline `@@unique` délibérément : le connecteur MongoDB de
 * Prisma émettrait un index unique NON partiel, qui traite tous les `null`
 * comme égaux et casserait l'envoi pour toutes les lignes historiques. Le choix
 * est bon. **Ce qui manquait, c'est tout ce qui le rendait VRAI** : aucun
 * déploiement ne joue `prisma/migrations/*.mongodb.js`, aucun lanceur n'existe,
 * et rien ne vérifiait sa présence.
 *
 * ─── Il a déjà manqué DEUX MOIS en production ────────────────────────────────
 *
 * Ce n'est pas une hypothèse. Du 2026-05-09 au 2026-07-02, et pour deux raisons
 * qu'aucun témoin portant sur le fichier de migration n'aurait vues :
 *
 * | panne | ce qu'elle a donné |
 * |---|---|
 * | `$ne` dans le `partialFilterExpression` — opérateur NON supporté | `createIndex` lève, « l'index n'a JAMAIS existé en prod » |
 * | `db.messages` au lieu de `db.Message` — le model n'a pas de `@@map` | une collection VIDE, « l'index semblait créé et ne protégeait rien » |
 *
 * Seul un audit manuel l'a trouvé. D'où la forme des témoins de ce module : ils
 * portent sur la RÈGLE (les opérateurs qu'un filtre partiel admet) et sur la
 * SOURCE du nom de collection, jamais sur une copie de la spec attendue — une
 * copie serait restée verte sur les deux pannes.
 *
 * ─── Posé à CHAQUE boot, du bon côté de la porte ─────────────────────────────
 *
 * `createIndexes` est nativement idempotent côté MongoDB, ce qui rend l'appel
 * payable à chaque démarrage. Et c'est à chaque démarrage qu'il faut le faire :
 * `shouldInitialize()` ne s'ouvre que sur une base VIDE, donc un rattrapage
 * derrière elle ne s'applique jamais à la base qui porte les messages. Le dépôt
 * a payé exactement cette confusion avec `ensurePostGeoIndex` — 500 en
 * production le 2026-08-25 — et `database-bootstrap.ts` existe pour la rendre
 * observable.
 *
 * Un conflit 85/86 est SIGNALÉ, jamais réparé ici : droper un index unique sous
 * une base vivante est l'affaire d'une migration nommée. Toute autre erreur
 * REMONTE — un `E11000` dit que des doublons existent déjà, c'est-à-dire
 * précisément ce que l'index devait empêcher, et l'avaler ferait du démarrage
 * le complice du défaut qu'il vient mesurer.
 */

/**
 * Le nom historique de l'index, repris tel quel de
 * `2026-07-02-fix-message-client-id-partial-index.mongodb.js` : les bases qui
 * l'ont déjà le portent sous ce nom, et en changer ferait poser un SECOND index
 * unique là où un seul doit vivre.
 */
export const MESSAGE_CLIENT_ID_INDEX = 'messages_conversationId_clientMessageId_unique';

/**
 * `$gt: ''` et non `$ne: ''`.
 *
 * Les deux sont équivalents sur une chaîne — `$gt ''` exclut exactement la
 * chaîne vide — mais un `partialFilterExpression` n'admet que l'égalité,
 * `$exists: true`, `$gt`/`$gte`/`$lt`/`$lte`, `$type` et `$and` racine. `$ne`
 * n'y est pas : c'est lui qui a fait lever `createIndex` pendant deux mois.
 */
const PORTE_UN_ID_CLIENT = { clientMessageId: { $exists: true, $type: 'string', $gt: '' } } as const;

export const MESSAGE_DEDUP_INDEXES: readonly IndexSpec[] = [
  {
    // `Message`, la MAJUSCULE du model Prisma : il ne porte aucun `@@map`, donc
    // la collection MongoDB en prend le nom. `messages` est une collection qui
    // n'existe pas, et un index posé dessus ne protège rien.
    collection: 'Message',
    name: MESSAGE_CLIENT_ID_INDEX,
    key: { conversationId: 1, clientMessageId: 1 },
    unique: true,
    partialFilterExpression: PORTE_UN_ID_CLIENT,
  },
];

export async function ensureMessageDedupIndexes(
  prisma: RawCommandRunner,
): Promise<Readonly<Record<string, BootIndexOutcome>>> {
  return ensureIndexesByCommand(prisma, MESSAGE_DEDUP_INDEXES);
}
