import type { ReadingModePreference } from '@meeshy/shared/types/reading-modes';

import type { Conversation, Message, MessageTranslation, Participant } from './types';

/**
 * LES DONNÉES DE DÉMONSTRATION — dans la FORME que sert la passerelle.
 *
 * Fixture FIXE et non aléatoire : c'est ce qui permet aux mesures de poids et
 * aux captures de suivre le CODE et non les données (la v3 en avait fait la
 * règle). Les HORAIRES, eux, sont ancrés sur MAINTENANT : une fixture datée du
 * 6 septembre affichait « Aujourd'hui » le 6 et « Hier » le 7 — les captures
 * changeaient de sens pendant la nuit, et un témoin qui cherchait
 * « Aujourd'hui » tombait sans qu'une ligne de code ait bougé. Ce qui doit
 * être fixe, c'est la FORME du jeu ; pas l'instant où on le regarde.
 *
 * CE QUI A CHANGÉ AVEC #5493. Ces objets étaient écrits dans une projection
 * locale — `sentAt`, `author`, `unread`, `isGrouped`. Ils sont désormais des
 * `Conversation` et des `Message` de `@meeshy/shared`, c'est-à-dire des charges
 * que la passerelle pourrait rendre telles quelles. Le jour où le transport
 * arrive (#5493, seconde moitié), ce fichier disparaît sans qu'aucun composant
 * ne bouge : ils lisent déjà le domaine.
 *
 * Le contenu est délibérément MULTILINGUE et déséquilibré — un message anglais
 * avec traduction française, un français sans traduction, un anglais SANS
 * traduction française. C'est le seul jeu qui fait tomber un résolveur de
 * Prisme faux : un jeu tout-français rendrait vert n'importe quelle
 * implémentation.
 */

/** `minutesAgo(90)` = il y a 90 minutes. Le fil se lit donc toujours comme aujourd'hui. */
const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * 60_000);

export const VIEWER_ID = 'u-viewer';
const CONVERSATION_ID = 'c-deploiement';

/**
 * Les champs qu'un `Participant` exige et dont la vue ne fait RIEN. Les poser
 * une fois ici plutôt qu'à chaque personne garde la fixture lisible sans
 * mentir sur la forme : ce sont bien des champs de la charge.
 */
const participantDefaults = {
  conversationId: CONVERSATION_ID,
  type: 'user',
  role: 'member',
  language: 'fr',
  permissions: {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: true,
    canSendLinks: true,
  },
  isActive: true,
  joinedAt: minutesAgo(60 * 24 * 30),
} as const;

const viewer: Participant = {
  ...participantDefaults,
  id: 'p-viewer',
  userId: VIEWER_ID,
  displayName: 'Vous',
  isOnline: true,
  lastActiveAt: minutesAgo(0),
};

const amina: Participant = {
  ...participantDefaults,
  id: 'p-amina',
  userId: 'u-amina',
  displayName: 'Amina Diallo',
  isOnline: true,
  lastActiveAt: minutesAgo(0),
};

/** Hors de la fenêtre d'une minute mais dans celle de trois : `away`, calculé. */
const kwame: Participant = {
  ...participantDefaults,
  id: 'p-kwame',
  userId: 'u-kwame',
  displayName: 'Kwame Mensah',
  isOnline: false,
  lastActiveAt: minutesAgo(2),
};

/**
 * Hors des fenêtres d'une ET de trois minutes, dans celle de cinq : `idle`,
 * le rang que ni `amina` (online) ni `kwame` (away) ne couvraient — sans
 * elle l'état `idle` de la loi 1/3/5 n'était observable nulle part dans le
 * jeu de démonstration (#5559 §5.3).
 */
const fatou: Participant = {
  ...participantDefaults,
  id: 'p-fatou',
  userId: 'u-fatou',
  displayName: 'Fatou Bâ',
  isOnline: false,
  lastActiveAt: minutesAgo(4),
};

export const PARTICIPANTS: readonly Participant[] = [viewer, amina, kwame];

/**
 * Une traduction est une LIGNE, pas une paire — c'est la forme que rend la
 * passerelle, et `buildTranslationRecord` (shared) est ce qui la ramène à la
 * carte `{ langue: texte }` que le Prisme consomme.
 */
const translation = (
  messageId: string,
  targetLanguage: string,
  translatedContent: string,
): MessageTranslation => ({
  id: `t-${messageId}-${targetLanguage}`,
  messageId,
  targetLanguage,
  translatedContent,
  translationModel: 'medium',
  createdAt: minutesAgo(0),
});

/** Les champs d'état qu'un message porte toujours, et qu'aucune fixture n'a à répéter. */
const messageDefaults = {
  conversationId: CONVERSATION_ID,
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 2,
  readCount: 2,
  reactionCount: 0,
  isEncrypted: false,
} as const;

const message = (
  partial: Omit<Message, keyof typeof messageDefaults | 'timestamp'> &
    Partial<Message> & { readonly createdAt: Date },
): Message => ({ ...messageDefaults, ...partial, timestamp: partial.createdAt });

/** Les compteurs de consommation d'une pièce jointe : zéro sur une fixture. */
const attachmentDefaults = {
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  viewedCount: 0,
  downloadedCount: 0,
  consumedCount: 0,
  isEncrypted: false,
  isForwarded: false,
  isAnonymous: false,
  capturedInApp: false,
} as const;

const kwameQuestion = message({
  id: 'm4',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Nice. But the cold start is still above two seconds on 3G.',
  originalLanguage: 'en',
  translations: [],
  createdAt: minutesAgo(87),
});

export const MESSAGES: readonly Message[] = [
  message({
    id: 'm1',
    senderId: 'u-amina',
    sender: amina,
    content: 'Good morning! Did the deployment finish last night?',
    originalLanguage: 'en',
    translations: [translation('m1', 'fr', 'Bonjour ! Est-ce que le déploiement a fini cette nuit ?')],
    createdAt: minutesAgo(96),
  }),
  message({
    id: 'm2',
    senderId: VIEWER_ID,
    sender: viewer,
    content: 'Oui, tout est passé vers 3 h. Je te montre le rapport.',
    originalLanguage: 'fr',
    translations: [
      translation('m2', 'en', 'Yes, everything went through around 3am. Let me show you the report.'),
    ],
    createdAt: minutesAgo(94),
  }),
  message({
    id: 'm3',
    senderId: VIEWER_ID,
    sender: viewer,
    content: '',
    originalLanguage: 'fr',
    messageType: 'image',
    translations: [],
    createdAt: minutesAgo(93),
    attachments: [
      {
        ...attachmentDefaults,
        id: 'a1',
        messageId: 'm3',
        fileName: 'rapport.png',
        originalName: 'rapport-deploiement.png',
        mimeType: 'image/png',
        fileSize: 184_320,
        fileUrl: '',
        alt: 'Capture du tableau de bord de déploiement, tous les services au vert',
        width: 1200,
        height: 800,
        uploadedBy: VIEWER_ID,
        createdAt: minutesAgo(93).toISOString(),
      },
    ],
  }),
  kwameQuestion,
  message({
    id: 'm5',
    senderId: 'u-amina',
    sender: amina,
    content: '',
    originalLanguage: 'fr',
    messageType: 'audio',
    translations: [],
    createdAt: minutesAgo(85),
    attachments: [
      {
        ...attachmentDefaults,
        id: 'a2',
        messageId: 'm5',
        fileName: 'note.m4a',
        originalName: 'note-vocale.m4a',
        mimeType: 'audio/mp4',
        fileSize: 42_100,
        fileUrl: '',
        duration: 12_000,
        uploadedBy: 'u-amina',
        createdAt: minutesAgo(85).toISOString(),
        capturedInApp: true,
      },
    ],
  }),
  message({
    id: 'm6',
    senderId: VIEWER_ID,
    sender: viewer,
    content: 'On peut passer à un routeur plus léger, ça ferait −24 Ko.',
    originalLanguage: 'fr',
    translations: [translation('m6', 'en', 'We can switch to a lighter router, that would save 24 KB.')],
    createdAt: minutesAgo(83),
    /**
     * La citation voyage ENTIÈRE (`replyTo`), pas seulement par son
     * identifiant : la passerelle enrichit la charge, et une bulle qui n'aurait
     * que `replyToId` devrait aller chercher le message cité — donc afficher
     * un trou le temps d'un aller-retour, sur le réseau le plus lent du monde.
     */
    replyToId: kwameQuestion.id,
    replyTo: kwameQuestion,
    reactionSummary: { '👍': 2 },
    reactionCount: 2,
  }),
  message({
    id: 'm7',
    senderId: 'u-amina',
    sender: amina,
    content: 'Je pousse la mesure ce soir.',
    originalLanguage: 'fr',
    translations: [translation('m7', 'en', "I'll push the measurement tonight.")],
    createdAt: minutesAgo(82),
    deliveredCount: 2,
    readCount: 0,
  }),
];

/**
 * LE FIL DU BANC — cinq cents messages, uniquement dans la variante de banc.
 *
 * `__BENCH__` est un LITTÉRAL posé à la construction (voir `vite.config.ts`).
 * Dans le build normal il vaut `0`, cette fonction n'est jamais appelée et
 * rolldown la retire : le gate de poids le prouve, et c'est la raison pour
 * laquelle le banc n'est pas un paramètre d'URL — mesurer la légèreté avec du
 * code de mesure embarqué aurait mesuré autre chose.
 *
 * Les longueurs VARIENT délibérément (le modulo sur l'index) : une
 * virtualisation à hauteur fixe passe un banc de bulles identiques et échoue
 * sur un vrai fil, où un message d'un mot voisine un paragraphe.
 */
const benchMessages = (count: number): readonly Message[] =>
  Array.from({ length: count }, (_, i) => {
    const people = [amina, kwame, viewer] as const;
    const author = people[i % 3] as Participant;
    const words = 3 + ((i * 7) % 40);
    return message({
      id: `bench-${i}`,
      senderId: author.userId ?? VIEWER_ID,
      sender: author,
      content: `Message ${i} — ${'mesure '.repeat(words).trim()}.`,
      originalLanguage: 'fr',
      translations: [],
      createdAt: minutesAgo(600 - i),
    });
  });

export const THREAD_MESSAGES: readonly Message[] =
  __BENCH__ > 0 ? [...benchMessages(__BENCH__), ...MESSAGES] : MESSAGES;

const lastMessage = MESSAGES[MESSAGES.length - 1] as Message;

/** Les champs qu'une `Conversation` exige et que la vue ne consulte pas. */
const conversationDefaults = {
  status: 'active',
  visibility: 'private',
  isActive: true,
  createdAt: minutesAgo(60 * 24 * 30),
  updatedAt: minutesAgo(0),
} as const;

/**
 * `userPreferences` mime EXACTEMENT la forme que sert
 * `GET /api/v1/conversations` : un TABLEAU d'au plus une entrée
 * (`services/gateway/src/routes/conversations/core-list.ts:360-365`, `take: 1`),
 * projetée par `conversationUserPreferencesSelect`
 * (`services/gateway/src/routes/conversations/core-selects.ts:62-80`) — jamais
 * une carte aplatie. `src/lib/api/preferences.ts` (`flagsOf`/`customNameOf`)
 * en fait le narrowing.
 */
export const CONVERSATIONS: readonly Conversation[] = [
  {
    ...conversationDefaults,
    id: CONVERSATION_ID,
    title: 'Équipe déploiement',
    type: 'group',
    memberCount: 3,
    participants: PARTICIPANTS,
    unreadCount: 2,
    lastMessage,
    lastMessageAt: lastMessage.createdAt,
    /**
     * La carte d'aperçu que la passerelle PRÉCALCULE pour la ligne de liste,
     * déjà restreinte aux langues du lecteur. La ligne descend celle-ci, pas
     * `lastMessage.translations` : c'est ce que sert `GET /conversations`.
     */
    lastMessageTranslations: { en: "I'll push the measurement tonight." },
    lastMessageOriginalLanguage: 'fr',
  },
  {
    ...conversationDefaults,
    id: 'c-amina',
    type: 'direct',
    memberCount: 2,
    participants: [viewer, amina],
    unreadCount: 0,
    /**
     * L'ÉPINGLÉE (#5559 §5.3) : son dernier message est le plus ANCIEN de la
     * liste (`minutesAgo(116)`, contre `minutesAgo(0)` pour l'équipe
     * déploiement) — sans l'épinglage elle serait dernière du tri ; avec lui
     * elle passe en tête. C'est ce qui rend le tri épinglées-d'abord
     * OBSERVABLE plutôt que vrai par coïncidence d'horodatage.
     */
    userPreferences: [{ isPinned: true, isMuted: false, isArchived: false }],
    lastMessage: message({
      id: 'm-amina',
      senderId: 'u-amina',
      sender: amina,
      content: 'See you tomorrow at the office.',
      originalLanguage: 'en',
      translations: [translation('m-amina', 'fr', 'On se voit demain au bureau.')],
      createdAt: minutesAgo(116),
    }),
    lastMessageAt: minutesAgo(116),
    lastMessageTranslations: { fr: 'On se voit demain au bureau.' },
    lastMessageOriginalLanguage: 'en',
  },
  {
    ...conversationDefaults,
    id: 'c-annonces',
    title: 'Annonces produit',
    type: 'public',
    visibility: 'public',
    memberCount: 128,
    participants: [viewer, kwame],
    unreadCount: 0,
    /** LA SOURDINE (#5559 §5.3) : rend l'opacité 0.55 de la rangée observable. */
    userPreferences: [{ isPinned: false, isMuted: true, isArchived: false }],
    lastMessage: message({
      id: 'm-annonces',
      senderId: 'u-kwame',
      sender: kwame,
      content: 'La v3.1 entre en test interne la semaine prochaine.',
      originalLanguage: 'fr',
      translations: [],
      createdAt: minutesAgo(1_000),
    }),
    lastMessageAt: minutesAgo(1_000),
    lastMessageOriginalLanguage: 'fr',
  },
  /**
   * UNE CONVERSATION SANS HISTORIQUE — elle n'est pas là pour décorer.
   * L'état vide est un état à part entière (« Complétude », dimension 13) et
   * il n'existe que si quelque chose y mène : sans cette entrée, l'écran vide
   * serait du code que personne, témoin compris, n'atteint jamais.
   */
  {
    ...conversationDefaults,
    id: 'c-nouvelle',
    type: 'direct',
    memberCount: 2,
    /**
     * `fatou` — le SEUL participant `idle` du jeu (rang 3 de la loi 1/3/5,
     * #5559 §5.3) : ni `amina` (online) ni `kwame` (away) ne couvraient ce
     * rang. Avant #5559 cette entrée réutilisait `amina` alors que son titre
     * affichait « Fatou Bâ » — un pair qui ne correspondait pas au nom rendu.
     */
    participants: [viewer, fatou],
    unreadCount: 0,
    /**
     * `updatedAt` explicite (#5559, revue) : `conversationDefaults` le pose à
     * `minutesAgo(0)` pour TOUTES les entrées — juste tant que rien ne le lit,
     * faux dès qu'`orderConversations` (§5.5) l'emploie en REPLI de
     * `lastMessageAt` absent. Sans cet override, une conversation SANS
     * historique remontait au-dessus d'une conversation ACTIVE dont le
     * dernier message date de plus d'une minute — le tri « le plus
     * récemment vivant d'abord » rendait l'inverse de ce qu'il promet.
     */
    updatedAt: minutesAgo(60 * 24 * 3),
  },
  {
    ...conversationDefaults,
    id: 'c-kwame',
    type: 'direct',
    memberCount: 2,
    participants: [viewer, kwame],
    unreadCount: 0,
    /**
     * LE CORPUS ARCHIVÉ (#5559 §5.3) : sans cette entrée, la chip
     * « Archivées » serait un état INATTEIGNABLE — rien dans le jeu ne
     * l'aurait jamais peuplée.
     */
    userPreferences: [{ isPinned: false, isMuted: false, isArchived: true }],
    lastMessage: message({
      id: 'm-kwame',
      senderId: VIEWER_ID,
      sender: viewer,
      content: 'Merci pour la relecture !',
      originalLanguage: 'fr',
      translations: [],
      createdAt: minutesAgo(1_265),
    }),
    lastMessageAt: minutesAgo(1_265),
    lastMessageOriginalLanguage: 'fr',
  },
];


/**
 * LA PRÉFÉRENCE DE MODE DE LECTURE PAR CONVERSATION (#5566, §3.4) — à la
 * forme EXACTE de `GET /api/v1/user-preferences/conversations/:id`
 * (`services/gateway/src/routes/conversation-preferences.ts:191`) : ligne
 * absente ⇒ défauts (`readingMode: 'auto'`, `version: 0`, `isDefault: true`).
 * `c-amina` porte un choix COLLANT (`script`, `version` > 0) pour que le
 * comportement « collant serveur » soit observable dans ce POC de fixtures.
 *
 * La v3.1 n'a AUCUNE couche réseau aujourd'hui (`src/lib/reading-mode/sync.ts`
 * ne fait que définir le PORT) : cette carte n'est consommée par rien encore
 * — elle prépare le lot `staging`, sans lui faire réinventer la forme.
 */
export type ConversationReadingModePreference = {
  readonly readingMode: ReadingModePreference;
  readonly version: number;
  readonly isDefault: boolean;
};

export const CONVERSATION_READING_MODE_PREFERENCES: Readonly<Record<string, ConversationReadingModePreference>> = {
  [CONVERSATION_ID]: { readingMode: 'auto', version: 0, isDefault: true },
  'c-amina': { readingMode: 'script', version: 3, isDefault: false },
};

/**
 * L'HISTORIQUE D'UNE CONVERSATION — vide par défaut, et c'est le point.
 *
 * Le POC servait la même liste de messages à toute adresse `/c/:id`, ce qui
 * rendait l'état « sans historique » inatteignable : il n'y avait aucun chemin
 * pour l'afficher, donc rien pour le vérifier. Une conversation sans messages
 * rend un tableau VIDE, exactement comme le fera la passerelle avant sa
 * première page de résultats.
 */
export const messagesOf = (conversationId: string): readonly Message[] => {
  if (conversationId === CONVERSATION_ID) return THREAD_MESSAGES;
  const last = CONVERSATIONS.find((c) => c.id === conversationId)?.lastMessage;
  return last === undefined ? [] : [last];
};
