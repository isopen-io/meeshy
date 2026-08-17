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
 * ═══ RÈGLE 3 — LE DÉBIT (MODE LENT) ════════════════════════════════════════
 *
 * Troisième et dernière colonne « WRITE PERMISSIONS » du schéma, et le même
 * défaut que les deux précédentes : `Conversation.slowModeSeconds` est complet
 * de bout en bout SAUF son application. Le schéma le documente (« minimum
 * seconds between messages per user »), `PUT /conversations/:id` l'écrit,
 * `conversation:updated` le diffuse, les modèles iOS le décodent, et
 * `ConversationSettingsView` offre un `Picker` qui le RÈGLE. Un modérateur
 * choisissait « 30 s », l'écran le confirmait, et rien ne ralentissait personne.
 *
 * **Pourquoi la règle avait été déclarée hors de portée.** Cet en-tête écrivait
 * qu'elle « demande un état *dernier envoi par personne* qui n'existe nulle
 * part ». C'était faux : l'état existe, c'est la table `Message` elle-même, dont
 * l'index `[senderId, conversationId]` porte exactement cette question. La
 * phrase cherchait un COMPTEUR — une colonne dénormalisée à tenir à jour — là
 * où le journal des messages est déjà autoritatif, et gratuit à interroger.
 *
 * **La fenêtre est bornée à la LECTURE, pas après.** `createdAt > now -
 * slowMode` filtre avant le tri : l'ensemble trié est borné par ce qu'une seule
 * personne a pu écrire pendant la fenêtre — quelques lignes — au lieu de tout
 * son historique dans la conversation. Aucun index neuf, et pas de tri en
 * mémoire qui grandirait avec l'ancienneté du fil.
 *
 * **Seuls les messages `messageSource: 'user'` comptent.** Les résumés d'appel
 * sont écrits par `CallService.postCallSummary` sur le participant de
 * l'INITIATEUR, qui ne les a pas tapés : sans ce filtre, raccrocher faisait
 * taire l'initiateur pendant toute la fenêtre. Le filtre positif ignore aussi
 * les documents antérieurs à la colonne (absent ≠ `'user'` sur le connecteur
 * MongoDB) — sans conséquence ici, la fenêtre ne regardant que les dernières
 * secondes.
 *
 * **Le refus PORTE son décompte.** `retryAfterSeconds` est la seule des trois
 * règles dont le refus est temporaire : un client qui reçoit « pas le droit »
 * range le message en échec, alors qu'ici il doit pouvoir le REPRÉSENTER. Le
 * décompte est arrondi au-dessus (un réessai à la seconde annoncée doit passer)
 * et plafonné au réglage lui-même (une ligne dans le futur, horloges
 * désaccordées, ne promet pas une attente plus longue que le réglage).
 *
 * **Le rang passe avant le débit.** « Vous n'écrivez pas ici » est absolu ;
 * l'annoncer comme un « pas encore » ferait attendre un client qui ne passera
 * jamais. Et les deux règles ont besoin du même rôle : il est lu UNE fois.
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
 * - **Un réglage d'écriture absent, inconnu ou négatif est PERMISSIF.** Les
 *   trois champs « WRITE PERMISSIONS » sont ABSENTS de toute conversation créée
 *   avant leur migration, et `PUT /conversations/:id` ne borne pas
 *   `slowModeSeconds` (`type: 'number'` sans minimum, donc une valeur négative
 *   est écrivable) : tous ces cas dégénèrent en « aucune restriction », soit
 *   l'état exact d'avant ce module. À l'inverse, une ligne de PARTICIPANT
 *   introuvable sur un conteneur restreint — par le rang OU par le débit —
 *   refuse : la restriction est connue, seule l'identité manque, et on n'admet
 *   pas ce qu'on ne peut pas prouver.
 * - **Rien n'est lu sur le chemin nominal.** Une conversation à
 *   `defaultWriteRole: 'everyone'` sans canal d'annonces ni mode lent ne coûte
 *   ni lecture de rôle, ni lecture de dernier envoi. Quand une restriction
 *   s'applique, rang de conversation et rôle global de plateforme arrivent en
 *   UNE lecture, jamais deux (idiome de `messageEditAdmission`) — et cette même
 *   lecture sert les deux règles.
 * - **Aucune lecture n'est enveloppée dans un `try`.** L'appelant a déjà
 *   interrogé la base une ligne plus haut (recherche du `Participant`) sans
 *   filet, et un envoi ne survit pas davantage à une base en panne. Avaler
 *   l'erreur ici n'ajouterait pas de robustesse — seulement un trou par lequel
 *   un envoi passerait dans une conversation close le jour où la base hoquette.
 *
 * ═══ CE QUE CE MODULE NE FAIT PAS ══════════════════════════════════════════
 *
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

/**
 * Rang à partir duquel on ne subit plus le mode lent.
 *
 * Le mode lent est un outil de MODÉRATION : celui qui l'a réglé ne se l'impose
 * pas, sans quoi il ne pourrait plus animer le fil qu'il ralentit. Dérivé de la
 * hiérarchie plutôt qu'énuméré, pour qu'un rôle inséré demain se place tout seul
 * du bon côté de la barre.
 */
const SLOW_MODE_BYPASS_RANK = WRITE_ROLE_RANK.moderator;

/**
 * Les types de conteneur qui n'ont AUCUNE hiérarchie d'écriture.
 *
 * `global` — tout le monde y parle. C'est ce que la règle orpheline énonçait, et
 * rien ne le contredit.
 *
 * `direct` — un tête-à-tête n'a pas d'administrateur. Ses deux lignes
 * `Participant` portent bien des rôles distincts — `creator` pour qui a ouvert
 * le fil, `member` pour l'autre (`routes/conversations/core.ts`, création) —
 * mais cette asymétrie nomme un ORDRE D'ARRIVÉE, pas une autorité sur l'autre
 * partie. Sans cette dispense, l'initiateur posait `isAnnouncementChannel` (ou
 * un plancher `defaultWriteRole`) sur le tête-à-tête et le rang refusait
 * DURABLEMENT les messages de son pair — `member` (1) sous un plancher `admin`
 * (3) — sans retour en arrière pour la victime, à qui `PUT /conversations/:id`
 * répond 403 précisément parce qu'elle est `member`.
 *
 * La route refuse désormais ces trois champs sur un `direct`, et les deux
 * gestes ne sont pas redondants : celui-là empêche l'état d'être écrit, cette
 * ligne-ci GUÉRIT les conteneurs déjà empoisonnés, dont aucune route ne rendra
 * jamais compte.
 *
 * La dispense porte sur le RANG, jamais sur l'existence : un tête-à-tête clos
 * reste refusé, l'état terminal étant tranché avant qu'on arrive ici.
 *
 * Elle porte AUSSI sur le débit, et pour la même raison : contourner le mode
 * lent est un privilège de RANG (cf. `SLOW_MODE_BYPASS_RANK`), donc une
 * hiérarchie. Dans un tête-à-tête, le `creator` — qui n'est que celui qui a
 * ouvert le fil — contournerait en imposant l'attente à son pair `member` :
 * l'attaque du cycle 56-bis, au ralenti.
 */
const WRITE_HIERARCHY_FREE_TYPES: ReadonlySet<string> = new Set(['global', 'direct']);

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
  readonly slowModeSeconds?: number | null;
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
        slowModeSeconds: true;
      };
    }): Promise<ConversationWriteStateRow | null>;
  };
  participant: {
    findUnique(args: {
      where: { id: string };
      select: { role: true; user: { select: { role: true } } };
    }): Promise<{ role?: string | null; user?: { role?: string | null } | null } | null>;
  };
  /**
   * Le dernier envoi de l'expéditeur DANS la fenêtre du mode lent.
   *
   * `createdAt: { gt }` borne le candidat AVANT le tri : l'ensemble trié est ce
   * qu'une personne a pu écrire pendant quelques secondes, pas son historique
   * entier dans le fil. L'égalité `conversationId` + `senderId` est portée par
   * l'index `[senderId, conversationId]` de `Message`.
   */
  message: {
    findFirst(args: {
      where: {
        conversationId: string;
        senderId: string;
        messageSource: string;
        createdAt: { gt: Date };
      };
      orderBy: { createdAt: 'desc' };
      select: { createdAt: true };
    }): Promise<{ createdAt?: Date | null } | null>;
  };
}

export type ConversationWriteRefusal =
  /** La conversation porte son état terminal — plus personne n'y écrit. */
  | 'conversation-closed'
  /** Le rang de l'expéditeur est sous celui que la conversation exige. */
  | 'write-role-insufficient'
  /** L'expéditeur a écrit trop récemment pour le mode lent du conteneur. */
  | 'slow-mode-active';

export type ConversationWriteAdmission =
  | { readonly admitted: true }
  | {
      readonly admitted: false;
      readonly reason: ConversationWriteRefusal;
      /**
       * Secondes à attendre avant que l'envoi passe — porté par le SEUL refus
       * temporaire (`slow-mode-active`). Les deux autres sont des refus
       * définitifs, et annoncer une attente y ferait patienter pour rien.
       */
      readonly retryAfterSeconds?: number;
    };

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

/**
 * Ce qu'on DIT à l'expéditeur, en un seul exemplaire.
 *
 * Les trois sites de refus (le point de convergence et les deux chemins de lien)
 * portaient chacun un `if/else` binaire sur `reason`, en deux dialectes. La forme
 * binaire n'est pas seulement duplicatoire : elle range tout refus AJOUTÉ dans sa
 * branche par défaut, ce qui a fait annoncer le mode lent — un « pas encore » —
 * avec les mots d'un « jamais ». Un `switch` exhaustif sur l'union rend la
 * prochaine addition visible plutôt que silencieuse.
 */
export const describeConversationWriteRefusal = (refusal: ConversationWriteRefused): string => {
  switch (refusal.reason) {
    case 'conversation-closed':
      return 'Cette conversation est fermée : elle n’accepte plus de messages';
    case 'slow-mode-active':
      return `Mode lent actif : réessayez dans ${refusal.retryAfterSeconds ?? 1} s`;
    case 'write-role-insufficient':
    default:
      return 'Vous n’avez pas le droit d’écrire dans cette conversation';
  }
};

const ADMITTED: ConversationWriteAdmission = { admitted: true };
const REFUSED = (reason: ConversationWriteRefusal): ConversationWriteAdmission => ({
  admitted: false,
  reason
});
const THROTTLED = (retryAfterSeconds: number): ConversationWriteAdmission => ({
  admitted: false,
  reason: 'slow-mode-active',
  retryAfterSeconds
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
  const requiredRole = conversation.isAnnouncementChannel
    ? ANNOUNCEMENT_REQUIRED_ROLE
    : conversation.defaultWriteRole ?? 'everyone';
  return WRITE_ROLE_RANK[requiredRole] ?? 0;
};

/**
 * Les conteneurs dont la police d'écriture ne s'applique pas — ni le rang, ni le
 * débit. Cf. WRITE_HIERARCHY_FREE_TYPES pour le raisonnement.
 */
const hasWriteHierarchy = (conversation: ConversationWriteStateRow): boolean =>
  conversation.type == null || !WRITE_HIERARCHY_FREE_TYPES.has(conversation.type);

/**
 * La fenêtre du mode lent, en secondes. `0` = désactivé, et c'est aussi ce que
 * rend une valeur absente, non finie ou NÉGATIVE — `PUT /conversations/:id` ne
 * borne pas le champ, donc un négatif est écrivable et doit se lire « pas de
 * restriction » plutôt que produire un décompte à l'envers.
 */
const slowModeWindowSeconds = (conversation: ConversationWriteStateRow): number => {
  const configured = conversation.slowModeSeconds;
  if (typeof configured !== 'number' || !Number.isFinite(configured) || configured <= 0) return 0;
  return configured;
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
  prisma: Pick<ConversationWriteReader, 'participant' | 'message'>,
  params: {
    readonly conversation: ConversationWriteStateRow | null | undefined;
    /**
     * EXIGÉ, et non déduit de `conversation.id` : la fenêtre du mode lent se
     * cherche par `conversationId`, et le faire dépendre de la projection de
     * l'appelant rendrait la règle silencieusement INERTE là où ce champ
     * manquerait au `select`. Le compilateur pose la question à chaque site.
     */
    readonly conversationId: string;
    readonly senderParticipantId: string;
    /** Injectable pour les tests ; `Date.now()` en production. */
    readonly now?: number;
  }
): Promise<ConversationWriteAdmission> {
  const { conversation, conversationId, senderParticipantId, now = Date.now() } = params;

  if (isConversationClosed(conversation)) return REFUSED('conversation-closed');
  if (!conversation) return ADMITTED;
  if (!hasWriteHierarchy(conversation)) return ADMITTED;

  const requiredRank = requiredWriteRank(conversation);
  const slowModeSeconds = slowModeWindowSeconds(conversation);
  if (requiredRank === 0 && slowModeSeconds === 0) return ADMITTED;

  // UNE lecture pour les deux règles : toutes deux se tranchent sur le rôle de
  // conversation, avec le rôle global de plateforme dans la même ligne.
  const sender = await prisma.participant.findUnique({
    where: { id: senderParticipantId },
    select: { role: true, user: { select: { role: true } } }
  });
  if (!sender) return REFUSED('write-role-insufficient');

  const senderRank = WRITE_ROLE_RANK[sender.role ?? ''] ?? 0;
  const globalRole = sender.user?.role;
  const isPlatformStaff = globalRole != null && PLATFORM_STAFF_ROLES.has(globalRole);

  // Le RANG d'abord : un refus définitif ne doit jamais être annoncé comme une
  // attente, qui ferait patienter un client qui ne passera jamais.
  if (requiredRank > 0 && senderRank < requiredRank && !isPlatformStaff) {
    return REFUSED('write-role-insufficient');
  }

  if (slowModeSeconds === 0) return ADMITTED;
  if (senderRank >= SLOW_MODE_BYPASS_RANK || isPlatformStaff) return ADMITTED;

  const windowStart = new Date(now - slowModeSeconds * 1000);
  const lastSend = await prisma.message.findFirst({
    where: {
      conversationId,
      senderId: senderParticipantId,
      // Ce que l'utilisateur a lui-même envoyé. Les résumés d'appel portent le
      // participant de l'initiateur sans qu'il les ait tapés.
      messageSource: 'user',
      createdAt: { gt: windowStart }
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true }
  });

  // C'est la FENÊTRE de la requête qui tranche l'admission, pas l'arithmétique
  // ci-dessous : une ligne rendue est, par construction du filtre `gt`, dans les
  // `slowModeSeconds` dernières secondes. Reposer la question ici (`remaining >
  // 0 ?`) serait le MÊME calcul une seconde fois, et une branche qu'aucun état
  // de la base ne peut atteindre. L'absence de ligne est donc le seul « oui ».
  const lastSendAt = lastSend?.createdAt;
  if (lastSendAt == null) return ADMITTED;

  // Il ne reste qu'à CHIFFRER l'attente. Arrondie au-dessus pour qu'un réessai à
  // la seconde annoncée passe ; bornée des deux côtés parce qu'aucune horloge
  // n'est sûre — plafond au réglage (une ligne datée dans le futur ne promet pas
  // plus d'attente que le mode lent lui-même), plancher à 1 s (jamais un refus
  // qui invite à réessayer immédiatement, ni un décompte négatif).
  const remainingMs = lastSendAt.getTime() + slowModeSeconds * 1000 - now;
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return THROTTLED(Math.min(slowModeSeconds, remainingSeconds));
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
  params: {
    readonly conversationId: string;
    readonly senderParticipantId: string;
    /** Injectable pour les tests ; `Date.now()` en production. */
    readonly now?: number;
  }
): Promise<ConversationWriteAdmission> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: {
      type: true,
      isActive: true,
      closedAt: true,
      isAnnouncementChannel: true,
      defaultWriteRole: true,
      slowModeSeconds: true
    }
  });

  return admitConversationWriteFor(prisma, {
    conversation,
    conversationId: params.conversationId,
    senderParticipantId: params.senderParticipantId,
    now: params.now
  });
}
