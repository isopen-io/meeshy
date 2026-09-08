import type { Message, MessageTranslation, Participant } from './types';

/**
 * LE SOCLE DES FIXTURES — EXTRAIT de `fixtures.ts` (#5695, étape 1).
 *
 * `fixtures.ts` a franchi le budget de taille (1000-1200 lignes,
 * `CLAUDE.md` § Code Style) : ce fichier en porte les briques COMMUNES —
 * l'horloge relative, les cinq personnes du jeu, les usines `message()` /
 * `translation()`, les défauts de participant / message / pièce jointe / le
 * défaut de conversation — pour que `fixtures.ts` (le corpus « Équipe
 * déploiement » et les conversations de la liste) ET `fixtures-catchup.ts`
 * (le corpus « rattrapage », #5695) les IMPORTENT tous deux, sans qu'aucun
 * ne réécrive la sienne.
 *
 * EXTRACTION PURE : aucune ligne de comportement ne change ici — c'est ce
 * qui permet à `bun test` de rester vert avant l'ajout du corpus de
 * rattrapage, la preuve que l'extraction n'a rien déplacé d'observable.
 */

/** `minutesAgo(90)` = il y a 90 minutes. Le fil se lit donc toujours comme aujourd'hui. */
export const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * 60_000);

/**
 * `daysAgo` jours avant AUJOURD'HUI (calendrier LOCAL), à `hour:minute` —
 * DÉPLACÉ depuis `fixtures-catchup.ts` (#5696, étape 4b) plutôt que recopié :
 * `fixtures-river.ts` en a besoin pour l'ouverture du Salon Rivière, exactement
 * pour la même raison que #5695 l'a écrit — construire une date-calendrier
 * directement plutôt qu'espérer qu'un delta de minutes (`minutesAgo`) retombe
 * à plus de 3 h d'un minuit local.
 */
export const dayAt = (daysAgo: number, hour: number, minute: number): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute, 0, 0);
};

/**
 * L'ANCRE DU FIL « ÉQUIPE DÉPLOIEMENT » — `minutesAgo(96..82)` place ses huit
 * horodatages sur une fenêtre de 14 minutes qui, entre ~00:00 et ~01:36 heure
 * de Paris, franchit minuit et fait basculer `c-deploiement` en section
 * « Hier » (`lens/sections.test.ts` : « AUJOURD'HUI contient c-deploiement »).
 *
 * Le calendrier qui tranche est celui du LECTEUR de la loi partagée
 * (`resolveConversationSections` / `localCalendarDate`, qui compare deux
 * jours dans le `timeZone` REÇU, jamais celui du process) — le témoin fixe
 * `'Europe/Paris'`, donc c'est ce fuseau qui décide ici aussi, PAS
 * `new Date().getDate()` : sous `bun test`, le process tourne en `UTC`
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone === 'UTC'`, vérifié),
 * si bien qu'une arithmétique en heure LOCALE DU PROCESS ne détecte jamais la
 * traversée de minuit parisienne — c'est le bogue que la première version de
 * cette ancre a laissé passer (elle comparait des horloges UTC en croyant
 * comparer des horloges de Paris).
 *
 * `THREAD_ANCHOR` reproduit `minutesAgo(THREAD_SPAN_MINUTES)` (le PLUS ANCIEN
 * horodatage du fil) SAUF quand son jour calendaire PARISIEN diffère de celui
 * de « maintenant » — auquel cas l'ancre avance minute par minute jusqu'à
 * rejoindre le jour calendaire parisien de « maintenant » (au plus
 * `THREAD_SPAN_MINUTES` itérations, exécutées une seule fois au chargement du
 * module). `threadMoment(n)` reporte alors chaque horodatage à la même
 * distance de l'ancre qu'il l'aurait été de « maintenant » avec
 * `minutesAgo(n)` : l'ORDRE et les ÉCARTS entre messages sont préservés au
 * tick près, seule la traversée de minuit disparaît.
 */
const THREAD_SPAN_MINUTES = 96;
const parisCalendarDay = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    date,
  );

const THREAD_ANCHOR: Date = (() => {
  const at = new Date();
  const todayInParis = parisCalendarDay(at);
  let candidate = new Date(at.getTime() - THREAD_SPAN_MINUTES * 60_000);
  while (parisCalendarDay(candidate) !== todayInParis) {
    candidate = new Date(candidate.getTime() + 60_000);
  }
  return candidate;
})();

/** `threadMoment(96)` = le premier message du fil ; `threadMoment(82)` = le dernier — voir `THREAD_ANCHOR`. */
export const threadMoment = (minutesAgoAtWriting: number): Date =>
  new Date(THREAD_ANCHOR.getTime() + (THREAD_SPAN_MINUTES - minutesAgoAtWriting) * 60_000);

export const VIEWER_ID = 'u-viewer';
/** Le `username` du lecteur de fixture — `Participant` ne le porte pas à la racine (`participant.ts:125-150`). */
export const VIEWER_HANDLE = 'vous';

/** L'identifiant de la conversation « Équipe déploiement » — le fil historique du POC. */
export const CONVERSATION_ID = 'c-deploiement';

/**
 * Les champs qu'un `Participant` exige et dont la vue ne fait RIEN. Les poser
 * une fois ici plutôt qu'à chaque personne garde la fixture lisible sans
 * mentir sur la forme : ce sont bien des champs de la charge.
 */
export const participantDefaults = {
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

export const viewer: Participant = {
  ...participantDefaults,
  id: 'p-viewer',
  userId: VIEWER_ID,
  displayName: 'Vous',
  isOnline: true,
  lastActiveAt: minutesAgo(0),
};

export const amina: Participant = {
  ...participantDefaults,
  id: 'p-amina',
  userId: 'u-amina',
  displayName: 'Amina Diallo',
  isOnline: true,
  lastActiveAt: minutesAgo(0),
};

/** Hors de la fenêtre d'une minute mais dans celle de trois : `away`, calculé. */
export const kwame: Participant = {
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
export const fatou: Participant = {
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
export const bruno: Participant = {
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
export const translation = (
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
export const messageDefaults = {
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

export const message = (
  partial: Omit<Message, keyof typeof messageDefaults | 'timestamp'> &
    Partial<Message> & { readonly createdAt: Date },
): Message => ({ ...messageDefaults, ...partial, timestamp: partial.createdAt });

/** Les compteurs de consommation d'une pièce jointe : zéro sur une fixture. */
export const attachmentDefaults = {
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

/** Les champs qu'une `Conversation` exige et que la vue ne consulte pas. */
export const conversationDefaults = {
  status: 'active',
  visibility: 'private',
  isActive: true,
  createdAt: minutesAgo(60 * 24 * 30),
  updatedAt: minutesAgo(0),
} as const;
