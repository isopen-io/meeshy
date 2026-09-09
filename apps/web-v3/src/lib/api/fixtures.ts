import type { ReadingModePreference } from '@meeshy/shared/types/reading-modes';

import { previewUrlFor } from '@/lib/send/attachment-preview-url';

import type { Attachment, Conversation, Message, Participant } from './types';
import {
  CONVERSATION_ID,
  PARTICIPANTS,
  VIEWER_ID,
  amina,
  attachmentDefaults,
  conversationDefaults,
  fatou,
  kwame,
  message,
  minutesAgo,
  threadMoment,
  translation,
  viewer,
} from './fixtures-base';
import { CATCHUP_CONVERSATION, CATCHUP_CONVERSATION_ID, CATCHUP_MESSAGES } from './fixtures-catchup';
import {
  RIVER_CONTINUATION_WITNESS_ID,
  RIVER_CONVERSATION,
  RIVER_CONVERSATION_ID,
  RIVER_MESSAGES,
  RIVER_NO_TRANSLATION_WITNESS_ID,
} from './fixtures-river';

/**
 * LE SALON RIVIÈRE (#5648) vit désormais dans `fixtures-river.ts` (#5696,
 * étape 4a — extraction PURE, même geste que #5695 pour
 * `fixtures-catchup.ts`) : ce fichier dépassait le budget de taille
 * (1000-1200 lignes, `CLAUDE.md` § Code Style). Les deux témoins historiques
 * (`RIVER_CONTINUATION_WITNESS_ID`, `RIVER_NO_TRANSLATION_WITNESS_ID`) sont
 * RÉEXPORTÉS ici — leurs importateurs (`fixtures.test.ts`) ne bougent pas.
 */
export { RIVER_CONTINUATION_WITNESS_ID, RIVER_NO_TRANSLATION_WITNESS_ID };

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
 *
 * LE SOCLE (`minutesAgo`, les cinq personnes, `message()`/`translation()`,
 * les défauts) a été EXTRAIT vers `fixtures-base.ts` (#5695, étape 1) — ce
 * fichier a franchi le budget de taille (1000-1200 lignes) et le corpus
 * « rattrapage » (`fixtures-catchup.ts`) a besoin du même socle. `VIEWER_ID`
 * et `PARTICIPANTS` sont RÉEXPORTÉS ici pour que les importateurs existants
 * (`thread.tsx`, `conversations.tsx`) n'aient rien à changer.
 */
export { VIEWER_ID, PARTICIPANTS };

const kwameQuestion = message({
  id: 'm4',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Nice. But the cold start is still above two seconds on 3G.',
  originalLanguage: 'en',
  translations: [],
  createdAt: threadMoment(87),
});

export const MESSAGES: readonly Message[] = [
  message({
    id: 'm1',
    senderId: 'u-amina',
    sender: amina,
    content: 'Good morning! Did the deployment finish last night?',
    originalLanguage: 'en',
    translations: [translation('m1', 'fr', 'Bonjour ! Est-ce que le déploiement a fini cette nuit ?')],
    createdAt: threadMoment(96),
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
    createdAt: threadMoment(94),
  }),
  message({
    id: 'm3',
    senderId: VIEWER_ID,
    sender: viewer,
    content: '',
    originalLanguage: 'fr',
    messageType: 'image',
    translations: [],
    createdAt: threadMoment(93),
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
        createdAt: threadMoment(93).toISOString(),
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
    createdAt: threadMoment(85),
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
        createdAt: threadMoment(85).toISOString(),
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
    createdAt: threadMoment(83),
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
    createdAt: threadMoment(82),
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

/**
 * LA SALLE SÉCURISÉE (D-23, #5676) — la SEULE conversation du jeu qui porte
 * les quatre protections (flou, vue unique, éphémère, supprimé) : sans elle,
 * `protectionOf`/`ProtectedContent` ne peuvent être vus qu'à l'unité, jamais
 * ENSEMBLE sur un vrai fil, ce que le gate visuel (`check-thread-states.mjs`
 * §5) et les captures exigent. `conversationId` est réécrit EXPLICITEMENT
 * sur chaque message — `message()` empile `messageDefaults` (lié à
 * `CONVERSATION_ID`) AVANT `partial`, même discipline que `RIVER_MESSAGES`.
 */
const PROTECTION_CONVERSATION_ID = 'c-protection';

const protectionParticipants: readonly Participant[] = [viewer, amina, kwame];

const protectionIntro = message({
  id: 'prot-1',
  conversationId: PROTECTION_CONVERSATION_ID,
  senderId: 'u-amina',
  sender: amina,
  content: 'Reminder: never paste codes in the general channel.',
  originalLanguage: 'en',
  translations: [translation('prot-1', 'fr', 'Rappel : ne collez jamais de code dans le canal général.')],
  createdAt: minutesAgo(30),
});

/**
 * L'ACCUSÉ DE KWAME — un message TRADUIT, NON PROTÉGÉ, DERNIER de son propre
 * groupe (`kwame` change le locuteur, donc `prot-1` devient `tail` — la
 * grouping loi `continues()` n'admet que MÊME auteur/MÊME jour). Sans lui,
 * la Salle sécurisée n'a AUCUNE rangée qui puisse faire échouer le témoin
 * « au moins un drapeau sur une rangée traduite non voilée » (`prot-1`
 * resterait continué par `prot-2`, même auteur — `check-thread-states.mjs`
 * §10) : les six témoins de protection couvrent tous une forme différente,
 * mais aucun n'était utilisable comme repère « normal ».
 */
const protectionAck = message({
  id: 'prot-1b',
  conversationId: PROTECTION_CONVERSATION_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Noted, thanks.',
  originalLanguage: 'en',
  translations: [translation('prot-1b', 'fr', 'Reçu, merci.')],
  createdAt: minutesAgo(28),
});

/** FLOUTÉ (`isBlurred`) — au repos, ni le texte ni son sens ne doivent atteindre le DOM (§4.1). */
export const BLURRED_WITNESS_ID = 'prot-2';
const protectionBlurred = message({
  id: BLURRED_WITNESS_ID,
  conversationId: PROTECTION_CONVERSATION_ID,
  senderId: 'u-amina',
  sender: amina,
  content: 'Le code du coffre est 4817-2290.',
  originalLanguage: 'fr',
  translations: [],
  isBlurred: true,
  createdAt: minutesAgo(26),
});

/**
 * VUE UNIQUE, AVEC une traduction française — le témoin qui fait rougir
 * « pas de drapeau sur un message voilé ». DEUX conditions, pas une (revue) :
 * une TRADUCTION (sans elle `languageBand` rend `[]` et `PrismPastille` se
 * tait déjà) **et** la place de DERNIER de son groupe (`tail`) — la loi du
 * pied exige `isLastInGroup`, donc un message voilé continué par un message
 * du MÊME auteur ne montrerait aucun drapeau de toute façon, garde posée ou
 * non. C'est pourquoi `prot-4` suit sous une AUTRE identité : sans ce
 * changement, `prot-3` n'était pas `tail` et le témoin restait vert la garde
 * retirée (mesuré).
 */
export const VIEW_ONCE_WITNESS_ID = 'prot-3';
const protectionViewOnce = message({
  id: VIEW_ONCE_WITNESS_ID,
  conversationId: PROTECTION_CONVERSATION_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Here is the door code: 5531.',
  originalLanguage: 'en',
  translations: [translation(VIEW_ONCE_WITNESS_ID, 'fr', 'Voici le code de la porte : 5531.')],
  isViewOnce: true,
  isBlurred: true,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  createdAt: minutesAgo(22),
});

/**
 * VUE UNIQUE, sans traduction — le tap HORS LIGNE (§4.8 §9) se joue sur ce
 * second témoin. Il est d'AMINA, pas de Kwame : c'est ce qui referme le
 * groupe de `prot-3` et lui rend la place de `tail` dont son propre témoin a
 * besoin (voir le doc-comment ci-dessus).
 */
export const VIEW_ONCE_OFFLINE_WITNESS_ID = 'prot-4';
const protectionViewOnceOffline = message({
  id: VIEW_ONCE_OFFLINE_WITNESS_ID,
  conversationId: PROTECTION_CONVERSATION_ID,
  senderId: 'u-amina',
  sender: amina,
  content: 'Second code, à ne pas partager : 9902.',
  originalLanguage: 'fr',
  translations: [],
  isViewOnce: true,
  isBlurred: true,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  createdAt: minutesAgo(18),
});

/** ÉPHÉMÈRE — `expiresAt` dans le FUTUR, indépendamment de `createdAt` : le minuteur est vivant à l'ouverture. */
export const EPHEMERAL_WITNESS_ID = 'prot-5';
const protectionEphemeral = message({
  id: EPHEMERAL_WITNESS_ID,
  conversationId: PROTECTION_CONVERSATION_ID,
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Je passe au bureau dans dix minutes.',
  originalLanguage: 'fr',
  translations: [],
  expiresAt: minutesAgo(-2),
  createdAt: minutesAgo(14),
});

/**
 * SUPPRIMÉ — `content` NON VIDE (miroir de `messages-advanced-delete.ts:180-183`,
 * qui blanchit `translations` mais jamais `content`) : le témoin doit pouvoir
 * FAIRE ÉCHOUER une fuite, pas se contenter d'un champ déjà vide.
 */
export const DELETED_WITNESS_ID = 'prot-6';
const protectionDeleted = message({
  id: DELETED_WITNESS_ID,
  conversationId: PROTECTION_CONVERSATION_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: 'Ce texte ne doit jamais être rendu.',
  originalLanguage: 'fr',
  translations: [],
  deletedAt: minutesAgo(4),
  createdAt: minutesAgo(10),
});

/** BRÛLÉ À L'ARRIVÉE — `viewOnceCount ≥ maxViewOnceCount` : aucune affordance, tombstone direct. */
export const BURNED_WITNESS_ID = 'prot-7';
const protectionBurned = message({
  id: BURNED_WITNESS_ID,
  conversationId: PROTECTION_CONVERSATION_ID,
  senderId: 'u-amina',
  sender: amina,
  content: 'Burned before you opened this.',
  originalLanguage: 'en',
  translations: [],
  isViewOnce: true,
  isBlurred: true,
  maxViewOnceCount: 1,
  viewOnceCount: 1,
  createdAt: minutesAgo(6),
});

/** Le dernier message de la salle — flouté : l'aperçu de LISTE a un sujet à protéger (§5.9). */
const protectionLastMessage = message({
  id: 'prot-8',
  conversationId: PROTECTION_CONVERSATION_ID,
  senderId: 'u-amina',
  sender: amina,
  content: 'Nouveau code demain matin : 7741.',
  originalLanguage: 'fr',
  translations: [],
  isBlurred: true,
  createdAt: minutesAgo(1),
});

const PROTECTION_MESSAGES: readonly Message[] = [
  protectionIntro,
  protectionAck,
  protectionBlurred,
  protectionViewOnce,
  protectionViewOnceOffline,
  protectionEphemeral,
  protectionDeleted,
  protectionBurned,
  protectionLastMessage,
];

export { PROTECTION_CONVERSATION_ID };

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
   *
   * `lastMessageAt` EST POSÉ (#5694, correction défaut 1) — `lastMessage`
   * reste absent (aucun message n'a jamais été envoyé), mais `lastMessageAt`
   * ne l'est JAMAIS sur le fil : `schema.prisma:495` le déclare
   * `DateTime @default(now())`, sans `?`, et le `select` de la liste le
   * demande sans condition (`core-list.ts:340`) — la passerelle sert
   * TOUJOURS une valeur, celle posée à la création de la conversation. Le
   * modèle iOS en fait autant : `CoreModels.swift:250` décode `lastMessageAt`
   * comme un `Date` NON optionnel. Une fixture qui omettait le champ
   * fabriquait un état que ni le serveur ni aucun client ne peut produire —
   * la rangée rendue perdait alors son heure (`lens-row.tsx`, `at === undefined`
   * ⇒ aucun `LensTime`), un défaut de CORPUS, pas de composant.
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
     *
     * `lastMessageAt` porte la MÊME valeur : sans message, le serveur ne
     * touche plus le champ après la création — les deux dates coïncident
     * pour cette conversation, comme elles le feraient sur le vrai wire.
     */
    updatedAt: minutesAgo(60 * 24 * 3),
    lastMessageAt: minutesAgo(60 * 24 * 3),
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
  RIVER_CONVERSATION,
  {
    ...conversationDefaults,
    id: PROTECTION_CONVERSATION_ID,
    title: 'Salle sécurisée',
    type: 'group',
    memberCount: 3,
    participants: protectionParticipants,
    unreadCount: 1,
    lastMessage: protectionLastMessage,
    lastMessageAt: protectionLastMessage.createdAt,
    /**
     * L'APERÇU DE LISTE A UN SUJET FLOUTÉ (§5.9, #5676) : ni traduction ni
     * carte à descendre — `previewKindOf` doit s'arrêter à `isBlurred` AVANT
     * de lire `lastMessageTranslations`.
     */
    lastMessageTranslations: {},
    lastMessageOriginalLanguage: 'fr',
  },
  CATCHUP_CONVERSATION,
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
 * LA CONSOMMATION D'UNE VUE UNIQUE SURVIT AU DÉMONTAGE DE LA ROUTE (revue
 * #5676, défaut 7). `messagesOf` repart des tableaux CONSTANTS ci-dessus à
 * CHAQUE montage de `/c/:conversation` : sans mémoire À CÔTÉ d'eux, quitter
 * le fil vers `/` puis y revenir relisait `viewOnceCount: 0` et le secret
 * se relisait — autant de fois qu'on veut, par n'importe quel visiteur. Le
 * réducteur `applyConsumption` (`lib/api/view-once.ts`) est juste, mais il
 * n'agit que sur l'état LOCAL de la route (`routes/thread.tsx`) ; ce qui
 * manquait était un endroit qui survit à ce démontage.
 *
 * Aujourd'hui les FIXTURES SONT le produit que tout le monde voit (staging
 * non branché, `apiConfig.source`) : cet ensemble EST donc la couche de
 * données, la même que le réseau remplacera par le `viewOnceCount` servi
 * par la passerelle (#5493) — une seule source, jamais une jumelle portée
 * par la route.
 */
const consumedViewOnceIds = new Set<string>();

/** Appelé par `routes/thread.tsx::consume` une fois la consommation confirmée. */
export function recordViewOnceConsumption(messageId: string): void {
  consumedViewOnceIds.add(messageId);
}

/**
 * TÉMOIN SEUL — jamais appelé par l'application. `consumedViewOnceIds` vit
 * pour la durée du PROCESSUS (module partagé entre tous les fichiers de
 * `bun test`, pas seulement entre les montages d'une route) : sans ce
 * remise à zéro, un test qui consomme `VIEW_ONCE_WITNESS_ID` ferait
 * dépendre `fixtures.test.ts` (qui l'attend à `viewOnceCount: 0`) de
 * l'ORDRE d'exécution des fichiers — exactement le défaut que la
 * discipline `afterEach` de `scheme.test.ts` évite déjà pour un état
 * global comparable.
 */
export function resetViewOnceConsumptionForTests(): void {
  consumedViewOnceIds.clear();
}

const withConsumption = (messages: readonly Message[]): readonly Message[] => {
  if (consumedViewOnceIds.size === 0) return messages;
  return messages.map((m) => {
    if (!m.isViewOnce || !consumedViewOnceIds.has(m.id)) return m;
    const max = m.maxViewOnceCount ?? 1;
    return m.viewOnceCount < max ? { ...m, viewOnceCount: max } : m;
  });
};

/**
 * LES MESSAGES ENVOYÉS PAR CE POC (#5813, étape 2) — même motif que
 * `consumedViewOnceIds` ci-dessus : les FIXTURES SONT le produit que tout le
 * monde voit (staging non branché), donc cette carte EST la couche de
 * données, la même que le réseau remplacera. `sendMessage` (`./messages.ts`)
 * y écrit sur chaque envoi en source `fixtures` ; `messagesOf` la resert à
 * CHAQUE montage de `/c/:conversation`, survivant au démontage de la route —
 * sans elle, un message envoyé disparaîtrait au premier aller-retour vers `/`.
 *
 * `clientMessageId` voyage sur le message stocké (`SentFixtureMessage`, un
 * SURENSEMBLE de `Message` — pas un champ du domaine partagé, § 3.4 de la
 * spécification) : la même raison que `LocalMessage` (`lib/send/local-message.ts`).
 */
export type SentFixtureMessage = Message & { readonly clientMessageId: string };

const sentMessages = new Map<string, SentFixtureMessage[]>();
let sentMessageCounter = 0;

/**
 * L'UPLOAD MULTIPART, EN FIXTURES (#5668) — mime
 * `POST /api/v1/attachments/upload` (`upload.ts:201`, `sendSuccess(reply, {
 * attachments })`) : chaque fichier reçu devient un `Attachment` du domaine,
 * indexé par SON id pour que `recordSentMessage` puisse l'associer au message
 * qu'il accompagne — le même geste que `associateAttachmentsToMessage`
 * (`MessageProcessor.ts:712-718`) côté serveur.
 */
const uploadedAttachmentsById = new Map<string, Attachment>();
let uploadedAttachmentCounter = 0;

export function uploadedAttachmentsOf(
  files: readonly { readonly file: File; readonly durationMs?: number; readonly localId?: string }[],
): readonly Attachment[] {
  return files.map(({ file, durationMs, localId }) => {
    uploadedAttachmentCounter += 1;
    const attachment: Attachment = {
      ...attachmentDefaults,
      id: `fx-att-${uploadedAttachmentCounter}`,
      messageId: '',
      fileName: file.name,
      originalName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      // Défaut 7 (revue #5668) : RÉUTILISE l'URL déjà créée pour cette pièce
      // (`previewUrlFor`, partagée avec la tuile du plateau ET la bulle
      // optimiste) plutôt que d'en créer une TROISIÈME — la vraie passerelle
      // sert une URL `https://`, jamais un blob : ce repli n'existe que
      // pour les fixtures, qui simulent la réponse serveur avec le fichier
      // déjà en main. `localId` absent (appelant hors `PendingAttachment`,
      // témoin direct) ⇒ repli sur une URL dédiée, comme avant.
      fileUrl: localId === undefined ? URL.createObjectURL(file) : previewUrlFor(localId, file),
      uploadedBy: VIEWER_ID,
      createdAt: new Date().toISOString(),
      ...(durationMs === undefined ? {} : { duration: durationMs }),
    };
    uploadedAttachmentsById.set(attachment.id, attachment);
    return attachment;
  });
}

/** TÉMOIN SEUL — même discipline que `resetSentMessagesForTests` ci-dessous. */
export function resetUploadedAttachmentsForTests(): void {
  uploadedAttachmentsById.clear();
  uploadedAttachmentCounter = 0;
}

export function recordSentMessage(
  conversationId: string,
  body: {
    readonly content?: string;
    readonly originalLanguage: string;
    readonly clientMessageId: string;
    readonly messageType?: 'image' | 'file' | 'audio' | 'video';
    readonly attachmentIds?: readonly string[];
    readonly replyToId?: string;
  },
): SentFixtureMessage {
  sentMessageCounter += 1;
  // Les ids INCONNUS de `uploadedAttachmentsById` sont IGNORÉS, jamais une
  // charge fabriquée à leur place — miroir `associateAttachmentsToMessage`,
  // qui n'associe que des pièces réellement téléversées.
  const attachments = (body.attachmentIds ?? [])
    .map((id) => uploadedAttachmentsById.get(id))
    .filter((a): a is Attachment => a !== undefined);
  const created: SentFixtureMessage = {
    ...message({
      id: `fx-sent-${sentMessageCounter}`,
      conversationId,
      senderId: VIEWER_ID,
      sender: viewer,
      content: body.content ?? '',
      originalLanguage: body.originalLanguage,
      messageType: body.messageType ?? 'text',
      translations: [],
      deliveredCount: 0,
      readCount: 0,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(body.replyToId === undefined ? {} : { replyToId: body.replyToId }),
      createdAt: new Date(),
    }),
    clientMessageId: body.clientMessageId,
  };
  const existing = sentMessages.get(conversationId) ?? [];
  sentMessages.set(conversationId, [...existing, created]);
  return created;
}

/** TÉMOIN SEUL — même discipline que `resetViewOnceConsumptionForTests`
 * ci-dessus : `sentMessages` vit pour la durée du PROCESSUS `bun test`. */
export function resetSentMessagesForTests(): void {
  sentMessages.clear();
  sentMessageCounter = 0;
}

const withSent = (conversationId: string, messages: readonly Message[]): readonly Message[] => {
  const sent = sentMessages.get(conversationId);
  return sent === undefined || sent.length === 0 ? messages : [...messages, ...sent];
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
  if (conversationId === CONVERSATION_ID) return withSent(conversationId, withConsumption(THREAD_MESSAGES));
  if (conversationId === RIVER_CONVERSATION_ID) return withSent(conversationId, withConsumption(RIVER_MESSAGES));
  if (conversationId === PROTECTION_CONVERSATION_ID)
    return withSent(conversationId, withConsumption(PROTECTION_MESSAGES));
  if (conversationId === CATCHUP_CONVERSATION_ID) return withSent(conversationId, withConsumption(CATCHUP_MESSAGES));
  const last = CONVERSATIONS.find((c) => c.id === conversationId)?.lastMessage;
  return withSent(conversationId, last === undefined ? [] : withConsumption([last]));
};

/**
 * LA FENÊTRE CHARGÉE COUVRE-T-ELLE TOUT LE NON-LU ? (#5695, étape 2) — mime
 * `cursorPagination.hasMore` (`services/gateway/src/routes/conversations/
 * messages-list.ts:724,764-771`) : `true` ssi des messages PLUS ANCIENS
 * existeraient au-delà de la première page. Seul `c-rattrapage` déclare sa
 * fenêtre partielle aujourd'hui — c'est ce qui rend « Sur les N derniers
 * messages » (Résumé Vivant, `LivingSummaryView.swift:71-75`) ATTEIGNABLE
 * sans mentir : les autres fils du jeu sont chargés en ENTIER.
 */
export const hasOlderMessagesOf = (conversationId: string): boolean =>
  conversationId === CATCHUP_CONVERSATION_ID;
