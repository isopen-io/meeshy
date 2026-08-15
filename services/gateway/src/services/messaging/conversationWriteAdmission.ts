/**
 * Ce que l'état de la CONVERSATION interdit à ses membres d'y écrire.
 *
 * Deux règles, découvertes par deux passes du cycle 31 et réunies ici parce
 * qu'elles répondent à la même question au même instant : *cette conversation
 * accepte-t-elle encore des messages, et de qui ?*
 *
 * ═══ RÈGLE 1 — L'ÉTAT TERMINAL ═════════════════════════════════════════════
 *
 * `packages/shared/prisma/schema.prisma` documente `Conversation.closedAt` par
 * « Conversation closed for all — **no one can write**, messages stay
 * readable ». La moitié droite était tenue ; la gauche ne l'était par personne.
 *
 * Balayage de tout `services/gateway/src` : `Conversation.isActive` et
 * `Conversation.closedAt` sont ÉCRITS (quatre routes de clôture), DIFFUSÉS
 * (`conversation:closed`) et LUS par le flux de rattrapage
 * (`utils/delta-tombstones.ts`, `closedAt > since`). Aucune lecture ne les
 * oppose jamais à un écrivain — zéro garde, sur aucun des transports.
 *
 * **Pourquoi personne ne l'a vu.** `isActive` existe sur DEUX modèles. Toutes
 * les gardes d'envoi en portent une — `where: { conversationId, userId,
 * isActive: true }` — et c'est celui du `Participant`. Une relecture qui
 * cherche « l'état actif est-il vérifié ? » le trouve partout et s'arrête. Or
 * fermer une conversation ne touche AUCUNE ligne `Participant` : les quatre
 * routes de clôture n'écrivent que sur `Conversation`. Les membres restent donc
 * actifs, indéfiniment, d'un fil que le serveur a déclaré mort — et la clôture
 * est IRRÉVERSIBLE : aucun écrivain du dépôt ne rallume `Conversation.isActive`.
 *
 * **Ce que ça coûtait.** `GET /conversations` filtre `isActive: true` à la
 * racine : la conversation close disparaît de la liste de tout le monde. Les
 * clients qui reçoivent `conversation:closed` la retirent aussi de leur cache
 * (web `use-socket-cache-sync`, iOS `SocialSocketManager`). Un message écrit
 * après coup arrive donc dans un conteneur que le destinataire n'a plus :
 * notification poussée, badge non lu incrémenté, et un fil introuvable dans la
 * liste. La clôture et l'envoi tardif courent l'un contre l'autre, et l'envoi
 * gagne.
 *
 * **Le prédicat lit les DEUX colonnes, et ce n'est pas de la ceinture.** Les
 * quatre écrivains de clôture ne s'accordent pas sur ce qu'ils écrivent :
 * `core.ts` et les deux branches de `delete-for-me.ts` posent `{ isActive:
 * false, closedAt, closedBy }`, mais `leave.ts` (créateur dernier membre)
 * n'écrit que `isActive: false` — constat latent nº 2 du cycle 30, non corrigé
 * depuis. Un prédicat qui ne lirait que `closedAt` laisserait ce quatrième
 * écrivain hors de la règle. Lire les deux fait tenir la garde sur l'état réel
 * de la base plutôt que sur la discipline de ses écrivains.
 *
 * ═══ RÈGLE 2 — LE RANG D'ÉCRITURE ══════════════════════════════════════════
 *
 * Le canal d'annonces est une fonctionnalité complète de bout en bout, sauf son
 * application. `POST /conversations` avec `type: 'broadcast'` écrit
 * `{ isAnnouncementChannel: true, defaultWriteRole: 'admin' }` ; `PATCH
 * /conversations/:id` laisse un admin y basculer n'importe quel groupe et
 * l'INTERDIT explicitement aux modérateurs ; `GET /conversations` sélectionne
 * le drapeau et le sert aux clients ; le schéma le documente en toutes lettres
 * — « Announcement-only mode (only creator/admins can write, overrides
 * defaultWriteRole) ». **Le serveur ne l'a jamais fait respecter : tout membre
 * pouvait y publier, avec le client officiel et sans requête forgée.**
 *
 * La règle EXISTAIT pourtant en entier — hiérarchie `everyone < member <
 * moderator < admin < creator`, dispense de la conversation globale,
 * échappatoire du staff plateforme — dans `MessageValidator.checkPermissions`,
 * dont un `grep` sur tout le monorepo ne rendait **aucun appelant de
 * production** : son unique invocateur était son propre fichier de test.
 * `handleMessage` n'appelle de ce module que `validateRequest`,
 * `resolveConversationId` et `detectLanguage`.
 *
 * C'est la variante la plus coûteuse du défaut de la règle 1. Là-bas la garde
 * manquait ; ici elle est écrite, juste, testée et soignée — et un audit qui
 * cherche « le canal d'annonces est-il appliqué ? » tombe dessus et conclut
 * oui. La seule question qui la démasque est celle qu'on ne pose pas à une
 * fonction qu'on vient de lire : **qui l'appelle ?** L'orphelin a donc été
 * SUPPRIMÉ plutôt que câblé : un garde orphelin à côté d'un garde réel est pire
 * qu'aucun garde.
 *
 * ═══ CE QUE LA DÉCISION RETIENT ════════════════════════════════════════════
 *
 * - **L'état terminal ne connaît AUCUNE dispense** — ni la conversation
 *   globale, ni le créateur, ni le staff plateforme. On n'écrit pas dans ce qui
 *   est clos, et la question du rang ne se pose même pas.
 * - **« Inconnu » n'est pas « terminal ».** Une ligne de conversation absente
 *   n'est pas un refus : cette unité n'est PAS l'autorité d'appartenance —
 *   celle-là est le `Participant`, que chaque appelant a vérifié juste avant.
 *   Lui faire aussi arbitrer l'existence lui donnerait deux raisons de changer
 *   et inventerait un mode d'échec là où le gardien d'à côté répond déjà. Même
 *   choix que `admitMessageForward` face à une source introuvable.
 * - **Un réglage d'écriture absent ou inconnu est PERMISSIF.** Les trois champs
 *   « WRITE PERMISSIONS » sont ABSENTS de toute conversation créée avant leur
 *   migration ; un `undefined` y dégénère en « aucune restriction », soit l'état
 *   exact d'avant ce module. À l'inverse, une ligne de PARTICIPANT introuvable
 *   sur un canal restreint refuse : la restriction est connue, seule l'identité
 *   manque, et on n'admet pas ce qu'on ne peut pas prouver.
 * - **Le rang n'est lu QUE si la conversation restreint réellement l'écriture**
 *   — jamais sur le chemin nominal (groupe ou DM à `defaultWriteRole:
 *   'everyone'`). Rang de conversation et rôle global de plateforme arrivent en
 *   UNE lecture, jamais deux (idiome de `messageEditAdmission`).
 * - **Aucune lecture n'est enveloppée dans un `try`.** L'appelant a déjà
 *   interrogé la base une ligne plus haut (recherche du `Participant`) sans
 *   filet, et un envoi ne survit pas davantage à une base en panne. Avaler
 *   l'erreur ici n'ajouterait pas de robustesse — seulement un trou par lequel
 *   un envoi passerait dans une conversation close le jour où la base hoquette.
 *
 * ═══ CE QUE CE MODULE NE FAIT PAS ══════════════════════════════════════════
 *
 * `Conversation.slowModeSeconds` est de la même famille (un réglage de conteneur
 * que personne n'applique) mais demande un état « dernier envoi par personne »
 * qui n'existe nulle part : c'est un limiteur de débit, pas une admission.
 * `Participant.permissions.canSendMessages` et les droits du lien de partage
 * sont appliqués par `routes/links/messages.ts` sur ses deux chemins, et
 * relèvent d'une passe qui leur est propre.
 */

/** La hiérarchie d'écriture, telle que `defaultWriteRole` la nomme au schéma. */
const WRITE_ROLE_RANK: Readonly<Record<string, number>> = {
  everyone: 0,
  member: 1,
  moderator: 2,
  admin: 3,
  creator: 4
};

/** Rang exigé par un canal d'annonces — il PRIME sur `defaultWriteRole`. */
const ANNOUNCEMENT_REQUIRED_ROLE = 'admin';

/** Rôles `User.role` qui écrivent partout, quel que soit leur rang local. */
const PLATFORM_STAFF_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'BIGBOSS', 'MODERATOR']);

/**
 * L'état de la conversation que la décision demande — état terminal ET police
 * d'écriture. Tous les champs sont optionnels : un document hérité ne les porte
 * pas tous, et leur absence est permissive (cf. l'en-tête).
 */
export interface ConversationWriteStateRow {
  readonly type?: string | null;
  readonly isActive?: boolean | null;
  readonly closedAt?: Date | null;
  readonly isAnnouncementChannel?: boolean | null;
  readonly defaultWriteRole?: string | null;
}

/** Conservé sous son nom d'origine : `isConversationClosed` n'a besoin que de ça. */
export type ConversationTerminalStateRow = Pick<
  ConversationWriteStateRow,
  'isActive' | 'closedAt'
>;

/**
 * Les deux lectures que la décision demande, en structural.
 *
 * `select` typé en littéraux `true` — et non en `Record<string, boolean>` —
 * pour que la surcharge générique de Prisma résolve la ligne rendue : la forme
 * large compile ici mais fait échouer l'appelant qui passe le vrai client.
 * Même contrainte, et même remède, que `ForwardSourceReader`.
 *
 * `participant.findUnique` rend le rang de conversation ET le rôle global dans
 * la même ligne : la branche restreinte coûte une lecture, pas deux.
 */
export interface ConversationWriteReader {
  conversation: {
    findUnique(args: {
      where: { id: string };
      select: {
        type: true;
        isActive: true;
        closedAt: true;
        isAnnouncementChannel: true;
        defaultWriteRole: true;
      };
    }): Promise<ConversationWriteStateRow | null>;
  };
  participant: {
    findUnique(args: {
      where: { id: string };
      select: { role: true; user: { select: { role: true } } };
    }): Promise<{ role?: string | null; user?: { role?: string | null } | null } | null>;
  };
}

export type ConversationWriteRefusal =
  /** La conversation porte son état terminal — plus personne n'y écrit. */
  | 'conversation-closed'
  /** Le rang de l'expéditeur est sous celui que la conversation exige. */
  | 'write-role-insufficient';

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
const REFUSED = (reason: ConversationWriteRefusal): ConversationWriteAdmission => ({
  admitted: false,
  reason
});

/**
 * L'état terminal, sur une ligne DÉJÀ chargée.
 *
 * Exporté à part parce que les deux routes de lien de partage ramènent l'état
 * de la conversation par la relation qu'elles chargent déjà : leur faire payer
 * une lecture de plus pour reposer une question dont elles tiennent la réponse
 * serait un coût gratuit.
 */
export const isConversationClosed = (
  conversation: ConversationTerminalStateRow | null | undefined
): boolean => {
  if (!conversation) return false;
  return conversation.isActive === false || conversation.closedAt != null;
};

/**
 * Le rang minimal qu'une conversation exige de qui y écrit. `0` = aucune
 * restriction, et c'est là que s'arrête le chemin nominal — sans lire personne.
 */
const requiredWriteRank = (conversation: ConversationWriteStateRow): number => {
  // La conversation globale n'a pas de hiérarchie d'écriture : tout le monde y
  // parle. C'est ce que la règle orpheline énonçait, et rien ne le contredit.
  if (conversation.type === 'global') return 0;

  const requiredRole = conversation.isAnnouncementChannel
    ? ANNOUNCEMENT_REQUIRED_ROLE
    : conversation.defaultWriteRole ?? 'everyone';
  return WRITE_ROLE_RANK[requiredRole] ?? 0;
};

/**
 * La règle entière, sur une ligne DÉJÀ chargée — la forme qu'emploient les
 * routes de lien de partage.
 *
 * L'état terminal passe en premier et sans dispense possible ; le rang n'est
 * interrogé que si la conversation restreint réellement l'écriture, et lui seul
 * peut coûter une lecture.
 */
export async function admitConversationWriteFor(
  prisma: Pick<ConversationWriteReader, 'participant'>,
  params: {
    readonly conversation: ConversationWriteStateRow | null | undefined;
    readonly senderParticipantId: string;
  }
): Promise<ConversationWriteAdmission> {
  const { conversation, senderParticipantId } = params;

  if (isConversationClosed(conversation)) return REFUSED('conversation-closed');
  if (!conversation) return ADMITTED;

  const requiredRank = requiredWriteRank(conversation);
  if (requiredRank === 0) return ADMITTED;

  const sender = await prisma.participant.findUnique({
    where: { id: senderParticipantId },
    select: { role: true, user: { select: { role: true } } }
  });
  if (!sender) return REFUSED('write-role-insufficient');

  if ((WRITE_ROLE_RANK[sender.role ?? ''] ?? 0) >= requiredRank) return ADMITTED;

  const globalRole = sender.user?.role;
  if (globalRole && PLATFORM_STAFF_ROLES.has(globalRole)) return ADMITTED;

  return REFUSED('write-role-insufficient');
}

/**
 * La règle, pour le point de convergence.
 *
 * Appelée depuis `MessagingService.handleMessage`, où REST, socket texte et
 * socket pièces jointes se rejoignent avant l'écriture — la même position, et
 * pour la même raison, qu'`admitMessageForward` : un garde posé plus près de
 * chaque route en aurait été la énième copie.
 */
export async function admitConversationWrite(
  prisma: ConversationWriteReader,
  params: { readonly conversationId: string; readonly senderParticipantId: string }
): Promise<ConversationWriteAdmission> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: {
      type: true,
      isActive: true,
      closedAt: true,
      isAnnouncementChannel: true,
      defaultWriteRole: true
    }
  });

  return admitConversationWriteFor(prisma, {
    conversation,
    senderParticipantId: params.senderParticipantId
  });
}
