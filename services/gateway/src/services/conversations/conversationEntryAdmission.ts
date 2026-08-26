/**
 * L'unique énoncé de « que faire de la ligne `Participant` déjà là quand
 * quelqu'un (re)entre dans une conversation ».
 *
 * Un départ ne supprime pas la ligne `Participant` : `POST /conversations/:id/leave`
 * la passe à `{ isActive: false, leftAt }`, et un bannissement à
 * `{ bannedAt, isActive: false, leftAt }`. Toute porte d'entrée doit donc
 * répondre à une question que le schéma rend inévitable — **une ligne existe
 * peut-être déjà, et son état dit ce qu'il faut en faire** — et les TROIS
 * portes y répondaient différemment. Aucune ne la traitait.
 *
 * | porte                                     | recherche de l'existant                  | ce qu'obtenait un ancien membre |
 * |-------------------------------------------|------------------------------------------|---------------------------------|
 * | `POST /conversations/join/:linkId`        | `{ conversationId, userId }` — sans `isActive` | « vous êtes déjà membre », 200, **jamais réintégré** |
 * | `POST /conversations/:id/participants`    | `{ …, isActive: true }` puis **`create`** | une **SECONDE ligne `Participant`** |
 * | `POST /conversations/:id/invite`          | `participants` inclus `where: { isActive: true }` puis **`create`** | une **SECONDE ligne `Participant`** |
 *
 * Trois défauts distincts, tous produits par le même prédicat absent — mais
 * **dans les deux directions opposées**, ce qui est la raison d'être de cette
 * unité :
 *
 *  1. **Trop permissif (sécurité) — le bannissement s'évade par la porte d'à
 *     côté.** Bannir écrit `isActive: false` ; les deux portes d'ajout ne
 *     cherchent que les lignes actives, ne trouvent donc pas le banni, et lui
 *     **créent une ligne neuve et active**. Le bannissement est défait sans
 *     passer par `POST …/unban` — et un `moderator`, qui n'a PAS le droit de
 *     débannir (`unban` exige le rang `admin`), a le droit d'ajouter : il
 *     débannit donc par un chemin qui ne s'appelle pas ainsi et n'écrit aucune
 *     trace.
 *  2. **Trop restrictif (produit) — on ne revient jamais.** La porte du lien de
 *     partage trouve la ligne inactive, en conclut « déjà membre » et répond
 *     200 sans rien écrire. Le client navigue alors vers une conversation que
 *     `GET /conversations/:id/messages` refuse, puisqu'elle exige une
 *     appartenance ACTIVE. Aucun autre chemin ne réactive la ligne : quitter
 *     une conversation rejointe par lien était **définitif**.
 *  3. **Lignes en double.** `Participant` ne porte aucune contrainte d'unicité
 *     sur `(conversationId, userId)` — le schéma ne rattrape rien. Deux lignes
 *     actives pour la même personne, c'est une identité d'expéditeur ambiguë
 *     (`findFirst` en choisit une au hasard), un fan-out doublé, et des
 *     réactions attribuées à un fantôme.
 *
 * **Pourquoi une unité partagée plutôt que trois corrections.** « Ajouter
 * `isActive: true` » réparait la porte 1 en aggravant les portes 2 et 3 : le
 * filtre fait tomber l'ancien membre dans le `create`, donc dans la seconde
 * ligne. Le prédicat manquant n'a pas de valeur juste dans l'absolu — il dépend
 * de ce qu'on fait ensuite de la ligne trouvée. C'est cette décision-là, et pas
 * le filtre, qui doit exister à un seul endroit.
 *
 * ─── CE QUE LA DÉCISION RETIENT ──────────────────────────────────────────────
 *
 * - **Un banni n'entre par aucune porte.** C'est la seule capacité retirée par
 *   ce cycle, et elle l'est dans le sens que la route de bannissement énonce
 *   explicitement. `POST …/unban` reste le chemin, et il écrit une trace.
 *
 *   **Et `unban` était lui-même une QUATRIÈME porte, non comptée ici** parce
 *   qu'elle ne s'appelle pas « entrer » : il écrivait `{ isActive: true,
 *   leftAt: null }` sans condition, donc il RÉ-ADMETTAIT quiconque avait été
 *   banni après être parti de lui-même — en lui rendant son rang périmé, ce que
 *   les trois portes ci-dessus refusent explicitement de faire. Ce qu'un
 *   bannissement prend et ce qu'un débannissement rend est désormais énoncé une
 *   seule fois dans `conversationBanState.ts`, complément de cette unité-ci :
 *   celle-là dit QUI peut entrer, celle-ci dit CE QUE le geste inverse rend.
 * - **Un ancien membre est RÉINTÉGRÉ sur sa ligne**, jamais dupliqué.
 * - **`joinedAt` est conservé** à la réintégration. Il ne date pas la ligne, il
 *   borne l'historique visible quand le lien de partage porte
 *   `allowViewHistory: false` (`routes/conversations/messages.ts`). Le remettre
 *   à maintenant retirerait à quelqu'un qui revient des messages qu'il avait
 *   déjà légitimement lus — et ce cycle ne retire aucune capacité vivante.
 * - **`role` et `permissions` repartent de ce que la porte donne à un nouvel
 *   arrivant.** Un ancien `admin` qui revient par un lien PUBLIC ne récupère
 *   pas silencieusement son rang : un rang se donne, il ne se retrouve pas dans
 *   une ligne périmée. C'est la leçon 89 — une permission ne doit pas survivre
 *   à la révocation du lien qui la justifiait.
 *
 * ─── L'ÉTAT DU CONTENEUR ─────────────────────────────────────────────────────
 *
 * Les trois portes ci-dessus interrogeaient l'état de la PERSONNE — bannie,
 * membre, ancienne, inconnue — et **aucune n'interrogeait celui de la
 * CONVERSATION.** Une conversation close acceptait donc encore des membres, par
 * les quatre portes, indéfiniment.
 *
 * C'est la moitié symétrique du constat de `conversationWriteAdmission` : le
 * schéma documente `Conversation.closedAt` par « closed for all — **no one can
 * write**, messages stay readable », et cette phrase-là est tenue depuis le
 * cycle 31. Personne n'avait posé la question voisine — *peut-on encore y
 * ENTRER ?* — dont la réponse était non écrite et valait « oui ».
 *
 * **Ce que ça coûtait, et pourquoi ça ne se voyait pas.** Une clôture n'éteint
 * aucun lien de partage : les quatre écrivains de clôture (`core.ts`,
 * `leave.ts`, les deux branches de `delete-for-me.ts`) n'écrivent que sur
 * `Conversation`, et `ConversationShareLink.isActive` leur survit. Un lien qui
 * circule reste donc joignable après la mort du fil, et la porte anonyme vérifie
 * NEUF propriétés du LIEN — actif, expiration, usages, concurrence, pays,
 * langue, plage IP, compte requis, identité requise — et zéro propriété de la
 * conversation. Ce qu'obtient l'arrivant :
 *
 *  - un **200**, et une ligne `Participant` neuve et active dans un fil mort ;
 *  - une conversation que `GET /conversations` ne rend pas (filtre `isActive`)
 *    et que les clients ont retirée de leur cache sur `conversation:closed` —
 *    donc introuvable dans la liste ;
 *  - un premier message refusé par `conversationWriteAdmission`, sans qu'aucun
 *    événement n'ait jamais expliqué pourquoi ;
 *  - un `conversation:participant-joined` diffusé aux membres d'un fil terminé.
 *
 * Pour l'anonyme, c'est terminal : sa seule identité est ce participant-là.
 *
 * **La garde LIT l'état, elle ne fait pas confiance aux écrivains.** Éteindre
 * les liens à la clôture serait l'autre correctif possible ; il ne couvrirait ni
 * l'ajout par un admin ni l'invitation, il ne dirait rien des conversations
 * DÉJÀ closes, et il ferait dépendre la fermeture de la porte de la discipline
 * de quatre écrivains — celle-là même qui a divergé trente-sept cycles durant
 * (cf. `conversationWriteAdmission` § « lire l'état réel de la base plutôt que
 * la discipline de ses écrivains »). Les deux colonnes sont lues, et pour la
 * raison qui y est écrite : les lignes fermées par l'ancien `leave.ts` n'ont
 * pas de `closedAt`.
 *
 * **La porte anonyme n'appelle PAS cette unité** — elle est keyée sur
 * `(conversationId, userId)`, et un anonyme n'a pas de `User.id`. Elle appelle
 * `isConversationClosed` directement, sur la ligne qu'elle charge déjà. C'est le
 * seul site que le typage ne contraint pas ; il a sa propre garde.
 *
 * ─── LES DOUBLONS DÉJÀ EN BASE ───────────────────────────────────────────────
 *
 * Les deux portes d'ajout en ont produit avant ce correctif. La décision lit
 * donc **toutes** les lignes de la paire `(conversationId, userId)`, pas la
 * première : un `findFirst` sur un jeu qui contient une ligne bannie et une
 * ligne active répondrait selon l'ordre de Mongo. L'agrégat est
 * conservateur — le bannissement l'emporte, puis l'appartenance active — et il
 * réintègre la ligne la plus récente, ce qui fait converger l'état sans script
 * de réparation.
 */

import {
  isConversationClosed,
  type ConversationTerminalStateRow,
} from '../messaging/conversationWriteAdmission';

/** L'état de la paire `(conversationId, userId)`, et ce que l'appelant doit en faire. */
export type ConversationEntryOutcome =
  /**
   * La CONVERSATION est terminale. Aucune porte ne s'ouvre, pour personne, et
   * aucune ligne `Participant` n'est même lue — cf. l'en-tête § L'ÉTAT DU
   * CONTENEUR.
   */
  | 'closed'
  /** Une ligne porte `bannedAt`. Aucune porte ne s'ouvre — `POST …/unban` est le chemin. */
  | 'banned'
  /** Une ligne active existe. Rien à écrire ; l'appelant répond « déjà membre ». */
  | 'already-member'
  /** Seules des lignes inactives existent. RÉACTIVER `participantId`, ne rien créer. */
  | 'rejoin'
  /** Aucune ligne. Créer, comme aujourd'hui. */
  | 'create';

export interface ConversationEntryDecision {
  readonly outcome: ConversationEntryOutcome;
  /**
   * La ligne que l'appelant doit réactiver (`rejoin`), ou celle qui explique le
   * refus (`banned`) / l'absence d'écriture (`already-member`). Absent sur
   * `create`, où il n'y a rien à désigner.
   */
  readonly participantId?: string;
}

/**
 * La seule lecture que la décision demande, en structural : le double de test
 * reste trivial et l'unité n'importe pas `PrismaClient`.
 */
export interface ConversationEntryReader {
  participant: {
    findMany(args: {
      where: { conversationId: string; userId: string };
      select: { id: true; isActive: true; bannedAt: true; joinedAt: true };
    }): Promise<
      Array<{
        id: string;
        isActive?: boolean | null;
        bannedAt?: Date | null;
        joinedAt?: Date | null;
      }>
    >;
  };
}

export interface ConversationEntryParams {
  prisma: ConversationEntryReader;
  conversationId: string;
  /** `User.id` de celui qui entre — jamais son `Participant.id`, qui n'existe pas encore au premier passage. */
  userId: string;
  /**
   * L'état terminal de la conversation qu'on rejoint — **obligatoire**, et
   * volontairement passé plutôt que lu.
   *
   * Passé, parce que DEUX des trois portes tiennent déjà la ligne
   * (`shareLink.conversation` pour la jointure par lien, le `findUnique` de
   * l'invitation) : leur faire payer une lecture de plus pour reposer une
   * question dont elles ont la réponse serait un coût gratuit — c'est le motif
   * qu'`isConversationClosed` énonce déjà pour lui-même.
   *
   * Obligatoire, parce qu'un paramètre optionnel aurait laissé la question sans
   * réponse à la porte qui l'oublie, et EN SILENCE. Requis, il fait échouer la
   * COMPILATION de toute porte — y compris une porte future — qui n'y répond
   * pas. `null` reste une réponse recevable : c'est celle d'un appelant qui a
   * cherché la conversation et ne l'a pas trouvée, et elle est permissive par
   * la même règle que les champs absents d'une ligne héritée (cf.
   * `isConversationClosed`) — la porte qui ne trouve pas la conversation a déjà
   * son propre 404 à rendre.
   */
  conversation: ConversationTerminalStateRow | null;
}

/**
 * La règle, une fois. Une lecture, quelle que soit la porte.
 *
 * Elle ne rattrape aucune erreur : une base illisible doit faire échouer la
 * jointure, pas produire un `create` qui doublerait la ligne qu'on n'a pas pu
 * lire. Les trois routes enveloppent déjà leur corps dans un `try/catch` qui
 * répond 500 — c'est la fermeture voulue.
 */
export async function resolveConversationEntry(
  params: ConversationEntryParams
): Promise<ConversationEntryDecision> {
  const { prisma, conversationId, userId, conversation } = params;

  // AVANT toute lecture de `Participant`, et ce n'est pas qu'une économie : la
  // question « que faire de la ligne déjà là » ne se pose que dans un conteneur
  // qui accepte encore quelqu'un. Une conversation terminale n'a ni membre à
  // réintégrer ni ligne à créer, et un `create` y serait exactement le défaut
  // que ce prédicat existe pour empêcher.
  if (isConversationClosed(conversation)) return { outcome: 'closed' };

  const rows = await prisma.participant.findMany({
    where: { conversationId, userId },
    select: { id: true, isActive: true, bannedAt: true, joinedAt: true },
  });

  if (rows.length === 0) return { outcome: 'create' };

  const banned = rows.find((row) => row.bannedAt != null);
  if (banned) return { outcome: 'banned', participantId: banned.id };

  const active = rows.find((row) => row.isActive === true);
  if (active) return { outcome: 'already-member', participantId: active.id };

  return { outcome: 'rejoin', participantId: mostRecentlyJoined(rows).id };
}

/**
 * Sans `joinedAt` exploitable, l'ordre rendu par la base fait foi — c'est le
 * comportement d'avant, et il ne concerne que des lignes toutes inactives, donc
 * équivalentes du point de vue de la décision.
 */
function mostRecentlyJoined<T extends { joinedAt?: Date | null }>(rows: readonly T[]): T {
  return rows.reduce((latest, row) => {
    const rowAt = row.joinedAt?.getTime();
    const latestAt = latest.joinedAt?.getTime();
    if (rowAt === undefined) return latest;
    if (latestAt === undefined) return row;
    return rowAt > latestAt ? row : latest;
  }, rows[0]);
}

/**
 * Ce qu'une réintégration écrit EN PLUS des champs que la porte donne à un
 * nouvel arrivant (`role`, `permissions`, `displayName`, `shareLinkId`…), et
 * qui diffèrent d'une porte à l'autre pour des raisons de produit antérieures à
 * ce cycle.
 *
 * `joinedAt` n'y figure pas : il est conservé, cf. l'en-tête.
 *
 * `historyVisibleFrom` y figure, lui, et c'est le pendant EXACT de la remise à
 * zéro du rang et des droits que les portes opèrent déjà (« un ancien admin qui
 * revient par un lien public ne récupère pas son rang dans une ligne
 * périmée ») : l'octroi par date est accordé à UNE arrivée. Il PRIME de plus sur
 * le droit figé et sur le lien — rang 2 de `historyFloorFor` —, donc le laisser
 * survivre ne se contentait pas d'être périmé : il court-circuitait la borne que
 * la nouvelle venue vient d'établir, dans les deux sens (un ancien octroi rouvre
 * ce que le lien ferme ; une ancienne restriction ferme ce qu'il ouvre).
 */
export const REJOIN_PARTICIPANT_STATE = {
  isActive: true,
  leftAt: null,
  historyVisibleFrom: null,
} as const;
