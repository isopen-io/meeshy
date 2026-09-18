/**
 * LA CHARGE SERVIE À LA RECETTE DE L'ADMINISTRATION SOUVERAINE (#7023).
 *
 * EXTRAIT de `check-admin-souverain.mjs`, par RESPONSABILITÉ et non par
 * tranche : le gate ORCHESTRE (il construit le `dist`, sème la session,
 * intercepte les routes, décide de l'ordre des sections), `lib/check-admin-
 * medias.mjs` CONSTATE, et ce module est la DONNÉE que les deux regardent.
 * C'est le troisième pas du même découpage, et il est arrivé par le budget :
 * le corpus a gagné une rangée de trois médiums (un vocal protégé, un fichier
 * libre, un fichier protégé — les deux branches de `Attachments` que le gate
 * n'atteignait pas) et l'hôte passait 1 000 lignes, le seuil « au-delà duquel
 * un découpage se justifie sans se discuter » (`CLAUDE.md` § Code Style).
 *
 * AUCUNE ROUTE HTTP N'EST INVENTÉE : les huit adresses servies par l'hôte
 * existent toutes dans `services/gateway/src/routes/{me,admin}`, et la forme
 * de chaque ligne est celle de `sovereign-message-projection.ts`.
 *
 * LE CORPUS EST BÂTI POUR QUE LE TÉMOIN DE PRISME NE PUISSE PAS VERDIR PAR
 * COÏNCIDENCE (leçon 261) : le membre administré lit `de › es`, son rang 1
 * (`de`) n'a AUCUNE traduction, l'administrateur lit `fr`, et l'original est
 * anglais — trois textes DIFFÉRENTS, un par descente.
 */


export const MEMBRE_ID = '64b000000000000000000042';
export const CONVERSATION_ID = '64c000000000000000000007';
const AUTRE_CONVERSATION_ID = '64c000000000000000000008';

/** L'ADMINISTRATEUR — sa langue d'application est le FRANÇAIS. */
export const SESSION = {
  token: 'jeton-de-recette',
  sessionToken: 'session-de-recette',
  user: {
    id: '64b000000000000000000001',
    username: 'recette-admin',
    displayName: 'Recette Admin',
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    customDestinationLanguage: null,
  },
  expiresAt: Date.now() + 60 * 60 * 1000,
};

const PERMISSIONS_NUES = {
  canAccessAdmin: true,
  canManageUsers: true,
  canManageGroups: false,
  canManageConversations: true,
  canViewAnalytics: false,
  canModerateContent: false,
  canViewAuditLogs: false,
  canManageNotifications: false,
  canManageTranslations: false,
  canManageAgent: false,
};

export const identiteServie = (avecAgent) => ({
  role: 'ADMIN',
  permissions: { ...PERMISSIONS_NUES, canManageAgent: avecAgent },
});

/** LE MEMBRE ADMINISTRÉ — allemand d'abord, espagnol ensuite. */
export const MEMBRE = {
  id: MEMBRE_ID,
  username: 'kaethe',
  displayName: 'Käthe Vogel',
  firstName: 'Käthe',
  lastName: 'Vogel',
  bio: '',
  avatar: '',
  email: 'kaethe@example.test',
  phoneNumber: '',
  role: 'USER',
  timezone: 'Europe/Berlin',
  systemLanguage: 'de',
  regionalLanguage: 'es',
  customDestinationLanguage: '',
  isActive: true,
  isOnline: false,
  deactivatedAt: null,
  deletedAt: null,
  deletedBy: null,
  lockedUntil: null,
  lockedReason: null,
  failedLoginAttempts: 0,
  lastPasswordChange: null,
  twoFactorEnabledAt: null,
  emailVerifiedAt: '2026-04-02T09:00:00.000Z',
  phoneVerifiedAt: null,
  lastActiveAt: '2026-09-16T18:20:00.000Z',
  createdAt: '2026-01-12T08:30:00.000Z',
  updatedAt: '2026-09-16T18:20:00.000Z',
};

const participant = (userId, displayName, role) => ({
  userId,
  displayName,
  avatar: null,
  role,
  joinedAt: '2026-02-01T10:00:00.000Z',
  isActive: true,
});

export const CONVERSATIONS_DU_MEMBRE = [
  {
    id: CONVERSATION_ID,
    identifier: 'projet-rosetta',
    title: 'Projet Rosetta',
    type: 'group',
    isActive: true,
    memberCount: 4,
    createdAt: '2026-02-01T10:00:00.000Z',
    lastMessageAt: '2026-06-02T11:00:00.000Z',
    participants: [
      participant(MEMBRE_ID, 'Käthe Vogel', 'MEMBER'),
      participant('u-alice', 'Alice', 'ADMIN'),
    ],
    membership: participant(MEMBRE_ID, 'Käthe Vogel', 'MEMBER'),
  },
  {
    id: AUTRE_CONVERSATION_ID,
    identifier: 'support-2026',
    title: 'Support 2026',
    type: 'group',
    isActive: true,
    memberCount: 9,
    createdAt: '2026-03-04T10:00:00.000Z',
    lastMessageAt: '2026-05-30T09:10:00.000Z',
    participants: [participant(MEMBRE_ID, 'Käthe Vogel', 'MEMBER')],
    membership: participant(MEMBRE_ID, 'Käthe Vogel', 'MEMBER'),
  },
];

export const MEDIAS_DU_MEMBRE = [
  { id: 'md-1', originalName: 'plan-de-salle.png', mimeType: 'image/png', source: 'message', isProtected: false },
  { id: 'md-2', originalName: 'note-vocale.m4a', mimeType: 'audio/mp4', source: 'message', isProtected: false },
  { id: 'md-3', originalName: 'contrat.pdf', mimeType: 'application/pdf', source: 'post', isProtected: true },
];

/**
 * Une vignette RÉELLE — un data-URI ne dépend d'aucune passerelle.
 *
 * **PNG et non SVG depuis #7023.** L'ancienne fixture était un SVG servi sous
 * `mimeType: 'image/svg+xml'` pendant que son `originalName` disait `.png` —
 * une incohérence sans conséquence tant que le constat se contentait de
 * COMPTER les balises. Il mesure désormais des PIXELS (`lib/check-admin-medias.mjs`) :
 * l'image est redessinée dans un canvas pour prouver que c'est bien ELLE qui
 * est peinte, et un canvas alimenté par un SVG peut être TEINTÉ selon le
 * moteur — un verdict qui dépendrait du navigateur n'en est pas un. C'est le
 * pixel indigo de `MEDIA_IMAGE_DATA_URI` (`src/lib/api/fixtures-media.ts`),
 * celui que `lib/check-media.mjs` mesure déjà en CI, étiré par `object-cover`
 * sur toute la tuile.
 */
const IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNITvsIAALqAbsneUV/AAAAAElFTkSuQmCC';

/**
 * CE QUI NE DOIT JAMAIS ATTEINDRE LE DOM (leçon 275) — le nom de fichier d'une
 * pièce protégée et l'aiguille de l'URL que la passerelle a retirée. La
 * seconde est posée DANS la charge du corpus, plus bavarde que ce que
 * `servedAttachment` sert : un témoin fail-closed se mesure sur une charge qui
 * porterait encore le secret.
 */
export const SECRETS_DES_PIECES = [
  'vue-unique-secret.png',
  'dossier-chiffre.png',
  'FUITE-SOUVERAINE',
  /* Les TROIS médiums, pas le seul visuel : le nom d'un vocal protégé, celui
     d'un fichier protégé, et les deux URL que leur charge portait encore. */
  'memo-secret.m4a',
  'dossier-confidentiel.pdf',
  'FUITE-VOCALE',
  'FUITE-DOSSIER',
];

export const TEXTES = {
  original: 'Hello team',
  espagnol: 'Hola equipo',
  francais: "Bonjour l'équipe",
  allemand: 'ABSENT — le rang 1 du membre n’a aucune traduction',
};

const expediteur = (id, nom) => ({
  id: `p-${id}`,
  userId: id,
  displayName: nom,
  avatar: null,
  user: { id, username: nom.toLowerCase() },
});

/** Le fil SERVI : `createdAt DESC`, la forme de `sovereign-message-projection.ts`. */
export const MESSAGES_SERVIS = [
  {
    id: 'm-reponse',
    conversationId: CONVERSATION_ID,
    senderId: MEMBRE_ID,
    content: 'Alles klar.',
    originalLanguage: 'de',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    reactionCount: 0,
    isEncrypted: false,
    isProtected: false,
    translations: [],
    attachmentCount: 0,
    attachments: [],
    replyTo: null,
    createdAt: '2026-06-02T11:05:00.000Z',
    sender: expediteur(MEMBRE_ID, 'Käthe'),
  },
  {
    id: 'm-protege',
    conversationId: CONVERSATION_ID,
    senderId: 'u-bob',
    content: null,
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    reactionCount: 0,
    isEncrypted: true,
    encryptionMode: 'e2ee',
    isProtected: true,
    translations: [],
    /* LA PIÈCE D'UN MESSAGE RETENU RESTE LISTÉE — c'est la politique de
       `servedAttachment` (« un administrateur doit pouvoir CONSTATER qu'un
       média existe »), et `fileUrl` y est DÉLIBÉRÉMENT bavard : le témoin
       fail-closed se mesure sur une charge plus généreuse que le serveur. */
    attachmentCount: 1,
    attachments: [
      {
        id: 'a-chiffre',
        messageId: 'm-protege',
        originalName: 'dossier-chiffre.png',
        mimeType: 'image/png',
        fileSize: 4096,
        fileUrl: 'data:image/png;base64,FUITE-SOUVERAINE',
        thumbnailUrl: null,
        transcription: null,
        translations: null,
        imageVariants: null,
        isProtected: true,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
      },
    ],
    replyTo: null,
    createdAt: '2026-06-02T11:00:00.000Z',
    sender: expediteur('u-bob', 'Bob'),
  },
  {
    /* LA PIÈCE SEULE EST PROTÉGÉE, LE MESSAGE NE L'EST PAS — le cas où les
       deux politiques divergent le plus : le texte reste lisible, la pièce
       arrive SANS URL, et seuls ses drapeaux bruts disent au client qu'il
       tient un secret plutôt qu'un fichier cassé. */
    id: 'm-piece-protegee',
    conversationId: CONVERSATION_ID,
    senderId: 'u-alice',
    content: 'Regarde la photo',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    reactionCount: 0,
    isEncrypted: false,
    isProtected: false,
    translations: [],
    attachmentCount: 1,
    attachments: [
      {
        id: 'a-vue-unique',
        messageId: 'm-piece-protegee',
        originalName: 'vue-unique-secret.png',
        mimeType: 'image/png',
        fileSize: 8192,
        fileUrl: null,
        thumbnailUrl: null,
        transcription: null,
        translations: null,
        imageVariants: null,
        isProtected: true,
        isViewOnce: true,
        viewOnceCount: 0,
        isBlurred: false,
      },
    ],
    replyTo: null,
    createdAt: '2026-06-02T10:30:00.000Z',
    sender: expediteur('u-alice', 'Alice'),
  },
  {
    /* LES DEUX AUTRES MÉDIUMS — `Attachments` PARTITIONNE (visuel / audio /
       fichier) et pose sa garde TROIS fois. Le corpus n'en atteignait qu'une :
       retirer la garde des deux autres laissait ce gate vert à 80 constats,
       mesuré. Ce qu'elles laissaient alors partir n'est pas une case vide —
       `servedAttachment` sert `originalName`, `fileSize` et `duration` SANS
       condition sur une pièce protégée (la ligne doit rester LISTABLE), et
       c'est le CLIENT qui les retient : le bloc fichier peint le nom et le
       poids, le widget vocal peint la durée. Les `fileUrl` sont délibérément
       bavards — un témoin fail-closed se mesure sur une charge plus généreuse
       que le serveur. */
    id: 'm-pieces',
    conversationId: CONVERSATION_ID,
    senderId: 'u-alice',
    content: 'Le dossier et le mémo',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    reactionCount: 0,
    isEncrypted: false,
    isProtected: false,
    translations: [],
    attachmentCount: 3,
    attachments: [
      {
        id: 'a-vocal-secret',
        messageId: 'm-pieces',
        originalName: 'memo-secret.m4a',
        mimeType: 'audio/mp4',
        fileSize: 20480,
        duration: 42000,
        fileUrl: 'data:audio/mp4;base64,FUITE-VOCALE',
        thumbnailUrl: null,
        transcription: null,
        translations: null,
        imageVariants: null,
        isProtected: true,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: true,
      },
      {
        id: 'a-fichier-libre',
        messageId: 'm-pieces',
        originalName: 'ordre-du-jour.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        fileUrl: 'data:application/pdf;base64,PDF-LIBRE',
        thumbnailUrl: null,
        transcription: null,
        translations: null,
        imageVariants: null,
        isProtected: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
      },
      {
        id: 'a-fichier-secret',
        messageId: 'm-pieces',
        originalName: 'dossier-confidentiel.pdf',
        mimeType: 'application/pdf',
        fileSize: 123904,
        fileUrl: 'data:application/pdf;base64,FUITE-DOSSIER',
        thumbnailUrl: null,
        transcription: null,
        translations: null,
        imageVariants: null,
        isProtected: true,
        isViewOnce: true,
        viewOnceCount: 0,
        isBlurred: false,
      },
    ],
    replyTo: null,
    createdAt: '2026-06-02T10:15:00.000Z',
    sender: expediteur('u-alice', 'Alice'),
  },
  {
    id: 'm-traduit',
    conversationId: CONVERSATION_ID,
    senderId: 'u-alice',
    content: TEXTES.original,
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    reactionCount: 0,
    isEncrypted: false,
    isProtected: false,
    translations: [
      {
        id: 't-es',
        messageId: 'm-traduit',
        targetLanguage: 'es',
        translatedContent: TEXTES.espagnol,
        createdAt: '2026-06-02T10:00:05.000Z',
      },
      {
        id: 't-fr',
        messageId: 'm-traduit',
        targetLanguage: 'fr',
        translatedContent: TEXTES.francais,
        createdAt: '2026-06-02T10:00:05.000Z',
      },
    ],
    attachmentCount: 2,
    attachments: [
      {
        id: 'a-image',
        messageId: 'm-traduit',
        originalName: 'plan-de-salle.png',
        mimeType: 'image/png',
        fileSize: 4096,
        fileUrl: IMAGE,
        thumbnailUrl: null,
        transcription: null,
        translations: null,
        imageVariants: null,
        isProtected: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
      },
      {
        id: 'a-vocal',
        messageId: 'm-traduit',
        originalName: 'note-vocale.m4a',
        mimeType: 'audio/mp4',
        fileSize: 20480,
        fileUrl: 'data:audio/mp4;base64,AAAAHGZ0eXBNNEEg',
        thumbnailUrl: null,
        transcription: { language: 'en', text: TEXTES.original },
        translations: {
          es: { type: 'audio', transcription: TEXTES.espagnol, url: 'data:audio/mp4;base64,AAAAHGZ0eXBNNEEh' },
          fr: { type: 'audio', transcription: TEXTES.francais, url: 'data:audio/mp4;base64,AAAAHGZ0eXBNNEEi' },
        },
        imageVariants: null,
        isProtected: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
      },
    ],
    replyTo: null,
    createdAt: '2026-06-02T10:00:00.000Z',
    sender: expediteur('u-alice', 'Alice'),
  },
];

export const AGENT_STATS = { totalConfigs: 4, activeConfigs: 3, totalControlledUsers: 12, totalMessagesSent: 486 };

export const AGENT_CONFIGS = [
  {
    conversationId: CONVERSATION_ID,
    conversation: { id: CONVERSATION_ID, title: 'Projet Rosetta' },
    enabled: true,
    isScanning: false,
    currentNode: null,
    controlledUserIds: ['u-alice', 'u-bob'],
    analytics: { messagesSent: 34, lastResponseAt: '2026-09-16T09:15:00.000Z' },
  },
];

export const AGENT_LOGS = [
  {
    id: 'log-1',
    conversationId: CONVERSATION_ID,
    conversation: { id: CONVERSATION_ID, title: 'Projet Rosetta' },
    trigger: 'manual',
    startedAt: '2026-09-16T09:14:30.000Z',
    durationMs: 4200,
    outcome: 'completed',
    messagesSent: 1,
    userIdsUsed: ['u-alice'],
  },
];
