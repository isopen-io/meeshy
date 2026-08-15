/**
 * Ce qui fait respecter, côté serveur, la seule phrase que le schéma consacre à
 * l'état terminal d'une conversation.
 *
 * `packages/shared/prisma/schema.prisma` documente `Conversation.closedAt` par
 * « Conversation closed for all — **no one can write**, messages stay
 * readable ». La moitié droite était tenue ; la gauche ne l'était par personne.
 *
 * ─── LE RECENSEMENT (cycle 31) ──────────────────────────────────────────────
 *
 * Balayage de tout `services/gateway/src` : `Conversation.isActive` et
 * `Conversation.closedAt` sont ÉCRITS (quatre routes de clôture), DIFFUSÉS
 * (`conversation:closed`) et LUS par le flux de rattrapage
 * (`utils/delta-tombstones.ts`, `closedAt > since`). Aucune lecture ne les
 * oppose jamais à un écrivain — zéro garde, sur aucun des transports.
 *
 * ─── POURQUOI PERSONNE NE L'A VU ────────────────────────────────────────────
 *
 * `isActive` existe sur DEUX modèles. Toutes les gardes d'envoi en portent une
 * — `where: { conversationId, userId, isActive: true }` — et c'est celui du
 * `Participant`. Une relecture qui cherche « l'état actif est-il vérifié ? » le
 * trouve partout et s'arrête. Or fermer une conversation ne touche AUCUNE ligne
 * `Participant` : les quatre routes de clôture n'écrivent que sur
 * `Conversation`. Les membres restent donc actifs, indéfiniment, d'un fil que le
 * serveur a déclaré mort — et la clôture est IRRÉVERSIBLE : aucun écrivain du
 * dépôt ne rallume `Conversation.isActive`.
 *
 * ─── CE QUE ÇA COÛTAIT ──────────────────────────────────────────────────────
 *
 * `GET /conversations` filtre `isActive: true` à la racine : la conversation
 * close disparaît de la liste de tout le monde. Les clients qui reçoivent
 * `conversation:closed` la retirent aussi de leur cache (web
 * `use-socket-cache-sync`, iOS `SocialSocketManager`). Un message écrit après
 * coup arrive donc dans un conteneur que le destinataire n'a plus : notification
 * poussée, badge non lu incrémenté, et un fil introuvable dans la liste. La
 * clôture et l'envoi tardif courent l'un contre l'autre, et l'envoi gagne.
 *
 * ─── LE PRÉDICAT LIT LES DEUX COLONNES, ET CE N'EST PAS DE LA CEINTURE ──────
 *
 * Les quatre écrivains de clôture ne s'accordent pas sur ce qu'ils écrivent :
 * `core.ts` et les deux branches de `delete-for-me.ts` posent
 * `{ isActive: false, closedAt, closedBy }`, mais `leave.ts` (créateur dernier
 * membre) n'écrit que `isActive: false` — constat latent nº 2 du cycle 30, non
 * corrigé depuis. Un prédicat qui ne lirait que `closedAt` laisserait ce
 * quatrième écrivain hors de la règle. Lire les deux fait tenir la garde sur
 * l'état réel de la base plutôt que sur la discipline de ses écrivains.
 *
 * ─── « INCONNU » N'EST PAS « TERMINAL » ─────────────────────────────────────
 *
 * Une ligne absente n'est pas un refus. Cette unité n'est PAS l'autorité
 * d'appartenance — celle-là est le `Participant`, que chaque appelant a vérifié
 * juste avant. Lui faire aussi arbitrer l'existence lui donnerait deux raisons
 * de changer et inventerait un mode d'échec là où le gardien d'à côté répond
 * déjà. Même choix que `admitMessageForward` face à une source introuvable.
 */

/**
 * Les deux seules colonnes que la décision demande.
 *
 * `select` typé en littéraux `true` — et non en `Record<string, boolean>` —
 * pour que la surcharge générique de Prisma résolve la ligne rendue : la forme
 * large compile ici mais fait échouer l'appelant qui passe le vrai client.
 * Même contrainte, et même remède, que `ForwardSourceReader`.
 */
export interface ConversationTerminalStateReader {
  conversation: {
    findUnique(args: {
      where: { id: string };
      select: { isActive: true; closedAt: true };
    }): Promise<ConversationTerminalStateRow | null>;
  };
}

export interface ConversationTerminalStateRow {
  readonly isActive?: boolean | null;
  readonly closedAt?: Date | null;
}

export type ConversationWriteRefusal = 'conversation-closed';

export type ConversationWriteAdmission =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason: ConversationWriteRefusal };

export type ConversationWriteRefused = Extract<ConversationWriteAdmission, { admitted: false }>;

/**
 * Le gateway compile en `strict: false`, où TypeScript ne rétrécit PAS une
 * union sur un discriminant littéral booléen : `if (!admission.admitted)`
 * laisse le type entier et `admission.reason` ne compile pas. Même prédicat
 * explicite que `isForwardRefused`, pour la même raison.
 */
export const isConversationWriteRefused = (
  admission: ConversationWriteAdmission
): admission is ConversationWriteRefused => admission.admitted === false;

const ADMITTED: ConversationWriteAdmission = { admitted: true };
const REFUSED: ConversationWriteAdmission = { admitted: false, reason: 'conversation-closed' };

/**
 * La règle, sur une ligne DÉJÀ chargée.
 *
 * Exporté à part parce que les deux routes de lien de partage ramènent
 * l'état terminal de la conversation par la relation qu'elles chargent déjà :
 * leur faire payer une lecture de plus pour reposer une question dont elles
 * tiennent la réponse serait un coût gratuit.
 */
export const isConversationClosed = (
  conversation: ConversationTerminalStateRow | null | undefined
): boolean => {
  if (!conversation) return false;
  return conversation.isActive === false || conversation.closedAt != null;
};

/**
 * La règle, pour le point de convergence.
 *
 * Appelée depuis `MessagingService.handleMessage`, où REST, socket texte et
 * socket pièces jointes se rejoignent avant l'écriture — la même position, et
 * pour la même raison, qu'`admitMessageForward` : un garde posé plus près de
 * chaque route en aurait été la énième copie.
 *
 * La lecture n'est PAS enveloppée dans un `try` : l'appelant a déjà interrogé
 * la base une ligne plus haut (recherche du `Participant`) sans filet, et un
 * envoi ne survit pas davantage à une base en panne. Avaler l'erreur ici
 * n'ajouterait pas de robustesse — seulement un trou par lequel un envoi
 * passerait dans une conversation close le jour où la base hoquette.
 */
export async function admitConversationWrite(
  prisma: ConversationTerminalStateReader,
  params: { readonly conversationId: string }
): Promise<ConversationWriteAdmission> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { isActive: true, closedAt: true }
  });

  return isConversationClosed(conversation) ? REFUSED : ADMITTED;
}
