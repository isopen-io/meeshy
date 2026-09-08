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
 * LE CINQUIÈME MEMBRE DU SALON RIVIÈRE (#5648, `targets/seed.md` §« Salon
 * Rivière » : `memberCount: 5`) — au mot près de la cible semée sur staging.
 * Il ne parle dans AUCUN des 40 messages (l'alternance A/B suffit à faire
 * défiler le fil) : sa seule fonction est de porter le compte de membres à
 * cinq, condition d'éligibilité de la Rivière (`conversation.memberCount`,
 * D-21) que ce lot ne rend pas encore mais ne doit pas fermer par erreur.
 */
const bruno: Participant = {
  ...participantDefaults,
  id: 'p-bruno',
  userId: 'u-bruno',
  displayName: 'Bruno Bêta',
  isOnline: false,
  lastActiveAt: minutesAgo(120),
};

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

/**
 * LE SALON RIVIÈRE (#5648) — la SEULE conversation du jeu qui DÉFILE assez
 * pour que la scène du fil (armement, élection, aplatissement, révélé) soit
 * observable et capturable. `c-deploiement` (7 messages) ne remplit jamais
 * `<main>` au-delà de sa hauteur visible — `check-reading-mode.mjs` §10
 * sautait sa propre mesure faute de « scrollSlack » (spécification #5648
 * §2), ce qui ne PROUVAIT rien. Quarante messages alternés, un jour, cinq
 * participants (`memberCount: 5`, condition d'éligibilité de la Rivière,
 * D-21) — la forme exacte du corpus semé sur staging
 * (`targets/seed.md` §« Salon Rivière »).
 *
 * `RIVER_CONVERSATION_ID` porte son propre `conversationId` : `message()`
 * spreads `messageDefaults` (lié à `CONVERSATION_ID`, l'Équipe déploiement)
 * AVANT `partial` — chaque entrée le RÉÉCRIT explicitement, jamais un
 * message du Salon Rivière n'hérite du fil voisin.
 */
const RIVER_CONVERSATION_ID = 'c-salon-riviere';

/** Les 40 phrases, dans l'ordre chronologique (la plus ancienne en tête). */
const RIVER_LINES: readonly string[] = [
  "On ouvre le salon pour la revue de la v3.1.",
  "Bonjour à toutes et tous.",
  "Je partage l'ordre du jour dans une minute.",
  "Parfait, on commence par le fil ou par la liste ?",
  "Le fil d'abord — c'est l'écran phare de cette itération.",
  "Focal s'ouvre bien par défaut chez moi, sur les deux plateformes.",
  "Même chose ici, et l'accent de la conversation est cohérent.",
  "On regarde l'élection au défilement soutenu ensuite.",
  "J'ai vu la carte se poser après quelques secondes de scroll.",
  "Chez moi elle s'arme presque tout de suite au trackpad.",
  "C'est attendu : la vitesse arme dès le premier geste franc.",
  "Et au repos, la carte se démonte en douceur.",
  "Oui, le fondu est propre dans les deux schémas.",
  "L'heure et les coches restent masquées hors du geste, bien vu.",
  "Elles reviennent bien pendant le défilement, dans les deux modes.",
  "Script ne montre jamais de carte, comme prévu.",
  "Confirmé, densité uniforme du premier au dernier message.",
  "On passe à la traduction maintenant.",
  "Le drapeau du pied ouvre bien l'original.",
  "Et la pastille du Prisme fait la même chose au même endroit.",
  "Les réactions restent visibles hors du mode Bulles, très bien.",
  "On vérifie la citation avec saut, tant qu'on y est.",
  "Le saut fonctionne, et le message cité se met en évidence.",
  "Un aparté : le composeur grandit bien avec le texte long.",
  "Et l'envoi reste optimiste même hors ligne, marqué en échec proprement.",
  "On teste vite le clavier sur le fil, pour la scène aussi.",
  "PageUp répété arme la scène comme le défilement à la souris.",
  "Bien vu, c'est la même intention côté clavier.",
  "On regarde les deux coques avant de clore ce point.",
  "La safe-area basse est respectée sur iOS cette fois.",
  "Le retour matériel Android ramène bien à la liste.",
  "Et la bascule sombre/clair à chaud est répercutée sans relancer.",
  "Trois défauts de coque soldés d'un coup, notable.",
  "On passe à la liste avant de refermer la revue.",
  "Le rail de stories est là, les filtres ont un effet réel.",
  "La recherche reste en bas, à portée du pouce.",
  "Le badge de non-lus est cohérent avec le fil ouvert.",
  "Je pense qu'on a fait le tour pour aujourd'hui.",
  "Merci à toutes et tous, on se retrouve la semaine prochaine.",
  "À bientôt !",
];

/**
 * CHAQUE message du Salon Rivière est TRADUIT, et un sur cinq est écrit en
 * ANGLAIS (correction de revue #5648). Sans traduction, la ligne basse ne
 * monte pas (`mountsBottomLine`) et la bande de focus de la rangée élue
 * n'existe jamais : le gate §10 « armait, élisait, aplatissait » sans
 * jamais faire naître la moitié de ce que l'élection AJOUTE — un corpus qui
 * ne peut pas faire échouer un témoin ne peut pas le valider. Un sur cinq en
 * anglais fait en plus naître la pastille du Prisme (`servedLanguage ≠
 * originalLanguage`, la seule condition qui la rende).
 */
/**
 * Les huit lignes ANGLAISES du Salon Rivière (une sur cinq) — la langue
 * D'ORIGINE de ces messages ; leur traduction française est la ligne
 * correspondante de `RIVER_LINES`, celle que le Prisme sert au lecteur
 * francophone.
 */
const RIVER_ENGLISH: Readonly<Record<number, string>> = {
  0: 'Opening the room for the v3.1 review.',
  5: 'Focal opens by default here, on both platforms.',
  10: "That's expected: velocity arms it on the first firm gesture.",
  15: 'Script never shows a card, as planned.',
  20: 'Reactions stay visible outside Bubbles mode, very good.',
  25: "Let's quickly test the keyboard on the thread, for the scene too.",
  30: 'The Android hardware back button does return to the list.',
  // `RIVER_LINES[35]` est « La recherche reste en bas, à portée du pouce. » —
  // ce libellé (rail de stories) est celui de `RIVER_LINES[34]`, un
  // décalage d'un cran hérité d'une réécriture antérieure du corpus
  // (correction de revue #5648, défaut majeur 4). Réutilisé tel quel comme
  // traduction anglaise de `RIVER_LINES_EN[34]` ci-dessous.
  35: 'The search stays at the bottom, within thumb’s reach.',
};

/**
 * LES TRENTE-DEUX TRADUCTIONS ANGLAISES RÉELLES des lignes françaises du
 * Salon Rivière (correction de revue #5648, défaut majeur 4) — table
 * PARALLÈLE à `RIVER_LINES`, symétrique de `RIVER_ENGLISH` : celle-ci porte
 * les huit messages D'ORIGINE anglaise, celle-là la traduction anglaise des
 * trente-deux messages D'ORIGINE française. Avant ce lot, la branche
 * française de `RIVER_MESSAGES` servait `content` (le français) comme SA
 * PROPRE traduction « en » : ouvrir 🇬🇧 sur un message français affichait le
 * français. Les huit indices de `RIVER_ENGLISH` sont ici IGNORÉS (la branche
 * anglaise ne lit jamais cette table), mais renseignés pour que le tableau
 * reste la traduction anglaise de CHAQUE ligne, sans trou.
 */
const RIVER_LINES_EN: readonly string[] = [
  'Opening the room for the v3.1 review.',
  'Hello everyone.',
  "I'll share the agenda in a minute.",
  'Great, do we start with the thread or the list?',
  "The thread first — it's the flagship screen this cycle.",
  'Focal opens by default here, on both platforms.',
  'Same here, and the conversation accent is consistent.',
  "Let's look at the election on sustained scroll next.",
  'I saw the card settle in after a few seconds of scrolling.',
  'Mine arms almost instantly on the trackpad.',
  "That's expected: velocity arms it on the first firm gesture.",
  'And at rest, the card flattens smoothly.',
  'Yes, the fade is clean in both schemes.',
  'The time and the checkmarks stay hidden outside the gesture, good catch.',
  'They do come back during scrolling, in both modes.',
  'Script never shows a card, as planned.',
  'Confirmed, uniform density from the first message to the last.',
  "Let's move on to translation now.",
  'The footer flag does open the original.',
  'And the Prism pastille does the same thing in the same spot.',
  'Reactions stay visible outside Bubbles mode, very good.',
  "Let's check the reply jump while we're at it.",
  'The jump works, and the quoted message gets highlighted.',
  'Side note: the composer grows nicely with long text.',
  'And sending stays optimistic even offline, marked as failed properly.',
  "Let's quickly test the keyboard on the thread, for the scene too.",
  'Repeated PageUp arms the scene just like scrolling with the mouse.',
  'Good catch, same intent on the keyboard side.',
  "Let's look at both shells before closing this point.",
  'The bottom safe area is respected on iOS this time.',
  'The Android hardware back button does return to the list.',
  'And the dark/light switch is reflected live, without a relaunch.',
  'Three shell defects fixed in one go, worth noting.',
  "Let's move to the list before we wrap up the review.",
  'The story rail is there, the filters have a real effect.',
  'The search stays at the bottom, within thumb’s reach.',
  'The unread badge is consistent with the open thread.',
  "I think we've covered everything for today.",
  'Thanks everyone, see you next week.',
  'See you soon!',
];

/**
 * DEUX RANGÉES-TÉMOINS DU DÉFAUT 1 (#5648, correction de revue) — avant ce
 * lot, `RIVER_MESSAGES` alternait STRICTEMENT l'auteur et traduisait CHAQUE
 * message : `mountsBottomLine` (`reading-mode/meta.ts`) ne pouvait donc
 * JAMAIS rendre `false` sur ce corpus — aucune rangée n'était ni une
 * CONTINUATION (`tail === false`) ni SANS traduction ni réaction, si bien
 * que le témoin §10 de `check-reading-mode.mjs` ne pouvait pas faire
 * échouer la garde « le tampon de focus ne recouvre jamais le texte qu'il
 * élit » sur une rangée SANS ligne basse — exactement la forme où le
 * recouvrement de 9 px a été mesuré. Un corpus qui ne peut pas faire
 * échouer un témoin ne peut pas le valider.
 *
 * - `RIVER_CONTINUATION_INDEX` (5) partage son auteur avec le message
 *   SUIVANT (6, forcé au même auteur ci-dessous) : `tail === false`,
 *   traduit, sans réaction — la forme « message qui n'est pas le dernier de
 *   son groupe ».
 * - `RIVER_NO_TRANSLATION_INDEX` (12) ne porte NI traduction NI réaction —
 *   la forme « message sans traduction ni réaction ». `frenchOriginals`
 *   (`fixtures.test.ts`) l'exclut explicitement de son invariant « chaque
 *   original français porte une traduction anglaise » : c'est le témoin
 *   VOULU qui le viole, pas un oubli.
 *
 * NI L'UN NI L'AUTRE index n'est choisi au hasard : le geste soutenu PAR
 * DÉFAUT de `check-reading-mode.mjs` §10 (4 200 ms à 400 px/s depuis le bas,
 * ~1 680 px, ~16 rangées de 104 px) élit une rangée proche de l'index ~23 —
 * les DEUX témoins restent loin de cette zone pour que le geste GÉNÉRIQUE
 * continue d'élire une rangée AVEC ligne basse (les witnesses historiques
 * de §10, boutons de la bande compris, le supposent) pendant que le geste
 * CIBLÉ (`electRow`, même script) vise ces deux-ci EXPLICITEMENT.
 */
const RIVER_CONTINUATION_INDEX = 5;
const RIVER_NO_TRANSLATION_INDEX = 12;
export const RIVER_CONTINUATION_WITNESS_ID = `riv-${RIVER_CONTINUATION_INDEX}`;
export const RIVER_NO_TRANSLATION_WITNESS_ID = `riv-${RIVER_NO_TRANSLATION_INDEX}`;

const RIVER_MESSAGES: readonly Message[] = RIVER_LINES.map((content, i) => {
  // Le message suivant `RIVER_CONTINUATION_INDEX` est forcé au MÊME auteur
  // que lui (`amina`, la valeur que l'alternance lui donne déjà à cet
  // index) : c'est ce qui rend ce message non-`tail` — une continuation.
  const isForcedContinuation = i === RIVER_CONTINUATION_INDEX + 1;
  const author = isForcedContinuation ? amina : i % 2 === 0 ? viewer : amina;
  const id = `riv-${i}`;
  const speaksEnglish = i % 5 === 0;
  const isNoTranslationWitness = i === RIVER_NO_TRANSLATION_INDEX;
  return message({
    id,
    conversationId: RIVER_CONVERSATION_ID,
    senderId: author.userId ?? VIEWER_ID,
    sender: author,
    content: speaksEnglish ? RIVER_ENGLISH[i] ?? content : content,
    originalLanguage: speaksEnglish ? 'en' : 'fr',
    translations: isNoTranslationWitness
      ? []
      : speaksEnglish
        ? [translation(id, 'fr', content)]
        : [translation(id, 'en', RIVER_LINES_EN[i] ?? content)],
    createdAt: minutesAgo(50 - i),
  });
});

const riverLastMessage = RIVER_MESSAGES[RIVER_MESSAGES.length - 1] as Message;

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
  {
    ...conversationDefaults,
    id: RIVER_CONVERSATION_ID,
    title: 'Salon Rivière',
    type: 'group',
    memberCount: 5,
    participants: [viewer, amina, kwame, fatou, bruno],
    /**
     * `unreadCount: 3`, PAS 26 (#5648 §9 question 7) : à 26 la loi de choix
     * de mode élirait `summary` (Résumé), clampé `focal` faute de rendu —
     * vrai mais BRUYANT pour ce lot, qui vérifie l'élection FOCALE. #5695
     * relèvera ce compte quand le Résumé sera rendu (D-21) ; un même corpus,
     * deux lots, jamais deux fixtures jumelles.
     */
    unreadCount: 3,
    lastMessage: riverLastMessage,
    lastMessageAt: riverLastMessage.createdAt,
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
  if (conversationId === RIVER_CONVERSATION_ID) return RIVER_MESSAGES;
  const last = CONVERSATIONS.find((c) => c.id === conversationId)?.lastMessage;
  return last === undefined ? [] : [last];
};
