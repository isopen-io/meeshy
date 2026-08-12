import { PRIVILEGED_GLOBAL_ROLES } from './messageEditAdmission.js';

/**
 * L'unique énoncé de « qui peut supprimer ce message ».
 *
 * Jumeau d'`admitMessageEdit`. Les cycles 33/34 ont unifié l'édition et laissé
 * la suppression recopiée à TROIS endroits, où les trois copies avaient déjà
 * divergé — chacune dans une direction différente :
 *
 * | entrée                                    | auteur | rôle CONVERSATION | rôle GLOBAL          | appartenance ACTIVE exigée |
 * |-------------------------------------------|--------|-------------------|----------------------|----------------------------|
 * | socket `message:delete`                   | oui    | oui               | MODERATOR/ADMIN/BIGBOSS | non                     |
 * | `DELETE /messages/:messageId`             | oui    | oui               | + **`CREATOR`** (mort)  | **non — membre INACTIF admis** |
 * | `DELETE /conversations/:id/messages/:mid` | oui    | **non**           | MODERATOR/ADMIN/BIGBOSS | **oui**                    |
 *
 * Trois défauts distincts en sortaient :
 *
 *  1. **La route conversation-scopée ignorait le rôle de CONVERSATION.** Son
 *     commentaire annonçait « modérateurs/admins/créateurs de cette
 *     conversation », mais le code lisait `membership.user.role` — le rôle
 *     GLOBAL. Un admin de conversation qui n'est qu'un `USER` global voyait donc
 *     sa suppression réussir depuis Android et depuis le composer web, et
 *     échouer en 403 depuis son iPhone et depuis la vue web : même personne,
 *     même message, trois réponses. C'est le patron de la leçon 88b — un
 *     commentaire qui affirme une règle que le code n'applique pas survit à la
 *     revue parce qu'on le lit comme un fait.
 *  2. **`DELETE /messages/:messageId` joignait les participants sans
 *     `isActive: true`.** Une ligne inactive gardée après un départ conservait
 *     indéfiniment le droit de supprimer : quitter une conversation ne retirait
 *     pas le pouvoir de modération qu'on y avait.
 *  3. **`CREATOR` n'appartient pas à l'enum `UserRole`** (USER, ADMIN,
 *     MODERATOR, BIGBOSS, AUDIT, ANALYST, AGENT). La branche ne pouvait jamais
 *     être vraie et donnait à lire une permission inexistante.
 *
 * ─── QUI APPELLE QUOI ────────────────────────────────────────────────────────
 *
 * Vérifié dans les QUATRE langages du dépôt (leçon 88 : « aucun appelant » ne se
 * conclut jamais d'une recherche sur un seul client). **Aucune entrée n'est
 * morte.**
 *
 * | entrée                                    | client                                                          |
 * |-------------------------------------------|-----------------------------------------------------------------|
 * | socket `message:delete`                   | web — `services/socketio/messaging.service.ts:422`              |
 * | `DELETE /messages/:messageId`             | Android — `core/network/.../api/MessageApi.kt:40`               |
 * | `DELETE /conversations/:id/messages/:mid` | iOS — `MeeshySDK/Services/MessageService.swift:138`             |
 * |                                           | web — `services/message.service.ts:75`                          |
 *
 * ─── CE QUE LA RÈGLE UNIFIÉE RETIENT ─────────────────────────────────────────
 *
 * L'UNION des trois intentions, jamais leur intersection : les trois copies
 * voulaient admettre le rôle de conversation (deux le faisaient, la troisième
 * l'annonçait), et deux admettaient le rôle global sans appartenance. Unifier
 * vers l'union ne retire donc aucune capacité vivante — seul le membre INACTIF
 * et le `CREATOR` mort disparaissent, et ni l'un ni l'autre n'était voulu.
 *
 * **Asymétrie assumée avec l'édition** : `admitMessageEdit` EXIGE une
 * appartenance active du non-auteur, la suppression non. Les deux sont
 * défendables — corriger le texte d'autrui à distance est plus intrusif que
 * retirer un contenu signalé — mais l'écart mérite un arbitrage produit, pas une
 * décision silencieuse de cette unité. Il est consigné dans `tasks/todo.md`.
 * Aucune fenêtre de 24h ici : aucune des trois copies n'en portait, et en
 * ajouter une retirerait à un auteur le droit de retirer son propre message.
 */

/** `Participant.role` — en MINUSCULES, contrairement à `User.role`. Confondre les deux a déjà produit un bypass mort. */
const PRIVILEGED_CONVERSATION_ROLES = new Set(['admin', 'moderator']);

/**
 * Les deux seules lectures que la décision peut demander, en structural : le
 * double de test reste trivial et l'unité n'importe pas `PrismaClient`.
 *
 * La ligne participant rend le rôle de CONVERSATION **et** le rôle GLOBAL de son
 * utilisateur en UNE lecture — c'est la forme que la route conversation-scopée
 * employait déjà. La conserver garantit qu'un non-auteur MEMBRE ne coûte jamais
 * plus d'un aller-retour, quelle que soit la branche qui l'admet.
 */
export interface DeleteAdmissionReader {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { role: true };
    }): Promise<{ role?: string | null } | null>;
  };
  participant: {
    findFirst(args: {
      where: { conversationId: string; userId: string; isActive: true };
      select: { id: true; role: true; user: { select: { role: true } } };
    }): Promise<{ id?: string | null; role?: string | null; user?: { role?: string | null } | null } | null>;
  };
}

export interface MessageDeleteAdmission {
  readonly admitted: boolean;
  /**
   * Le `Participant.id` de l'ACTEUR, quand la décision a eu à lire sa ligne.
   *
   * Il n'est pas un sous-produit gratuit qu'on expose par commodité : la file de
   * rejeu hors ligne exclut l'acteur dans les DEUX monnaies d'identité (cycle
   * 37), et sans cette valeur son appelant devrait refaire exactement la lecture
   * qu'on vient de faire — ou, pire, retomber sur `message.senderId`, qui
   * désigne l'AUTEUR et non l'acteur dès qu'un modérateur supprime.
   *
   * `undefined` pour l'auteur (aucune lecture — son `Participant.id` est
   * `message.senderId`, que l'appelant tient déjà) et pour l'admin GLOBAL non
   * participant (aucune ligne à lire). Dans les deux cas l'exclusion par
   * `User.id` suffit.
   */
  readonly actorParticipantId?: string;
}

export interface MessageDeleteAdmissionParams {
  prisma: DeleteAdmissionReader;
  /** `User.id` de l'acteur, tiré du contexte d'AUTHENTIFICATION — jamais de l'objet muté. */
  deleterUserId: string;
  message: {
    /** `User.id` de l'auteur — PAS le `Participant.id` que porte `senderId`. `null` pour un expéditeur anonyme. */
    authorUserId: string | null | undefined;
    conversationId: string;
  };
  onError?: (error: unknown) => void;
}

/**
 * La règle, une fois :
 *
 * - **L'auteur** supprime son message, sans limite de temps et sans aucune
 *   lecture — le chemin nominal ne touche pas la base.
 * - **Quelqu'un d'autre** supprime s'il porte un rôle privilégié, de
 *   CONVERSATION (`admin`/`moderator`, ce qui suppose une appartenance active)
 *   ou GLOBAL (`MODERATOR`/`ADMIN`/`BIGBOSS`, qui n'en suppose aucune).
 *
 * Coût : zéro lecture pour l'auteur, une pour un non-auteur membre, deux pour un
 * non-auteur non-membre. Les trois transports en faisaient au moins une, sur
 * TOUS les chemins y compris celui de l'auteur.
 *
 * Toute lecture échoue FERMÉE, et une lecture d'appartenance en échec ne dégrade
 * pas vers le rôle global : une base illisible ne fabrique ni privilège ni
 * appartenance, et ne doit pas non plus ouvrir un second chemin qui répondrait.
 */
export async function admitMessageDelete(
  params: MessageDeleteAdmissionParams
): Promise<MessageDeleteAdmission> {
  const { prisma, deleterUserId, message, onError } = params;

  const isAuthor = Boolean(message.authorUserId) && message.authorUserId === deleterUserId;
  if (isAuthor) return REFUSED_OR_ADMITTED(true);

  let membership: { id?: string | null; role?: string | null; user?: { role?: string | null } | null } | null;
  try {
    membership = await prisma.participant.findFirst({
      where: { conversationId: message.conversationId, userId: deleterUserId, isActive: true },
      select: { id: true, role: true, user: { select: { role: true } } },
    });
  } catch (error) {
    onError?.(error);
    return REFUSED_OR_ADMITTED(false);
  }

  if (membership) {
    const actorParticipantId = membership.id ?? undefined;
    const conversationRole = membership.role ?? undefined;
    if (conversationRole && PRIVILEGED_CONVERSATION_ROLES.has(conversationRole)) {
      return { admitted: true, actorParticipantId };
    }

    const globalRole = membership.user?.role ?? undefined;
    const admitted = Boolean(globalRole) && PRIVILEGED_GLOBAL_ROLES.has(globalRole);
    return { admitted, actorParticipantId: admitted ? actorParticipantId : undefined };
  }

  try {
    const record = await prisma.user.findUnique({ where: { id: deleterUserId }, select: { role: true } });
    const globalRole = record?.role ?? undefined;
    return REFUSED_OR_ADMITTED(Boolean(globalRole) && PRIVILEGED_GLOBAL_ROLES.has(globalRole));
  } catch (error) {
    onError?.(error);
    return REFUSED_OR_ADMITTED(false);
  }
}

/** Une décision sans `Participant.id` : l'auteur, l'admin global non membre, tout refus. */
const REFUSED_OR_ADMITTED = (admitted: boolean): MessageDeleteAdmission => ({ admitted });
