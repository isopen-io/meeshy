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

/**
 * `minutesAgo(90)` = il y a 90 minutes.
 *
 * **NE GARANTIT PAS "aujourd'hui" (#5769).** `resolveLensSections`
 * (`packages/shared/utils/conversation-sections.ts`) classe "aujourd'hui" /
 * "hier" dans LE CALENDRIER DE PARIS (`timeZone: 'Europe/Paris'`, systématique
 * dans les fixtures web-v3) — jamais dans celui, système, que `minutesAgo`
 * ignore. Entre 22 h et minuit UTC (heure d'été) ou 23 h et minuit UTC (heure
 * d'hiver), Paris a DÉJÀ changé de jour calendaire alors que l'instant réel
 * n'a pas encore franchi minuit UTC : un message "il y a 82 minutes" y
 * retombe sur LA VEILLE à Paris. Un message qui doit être OBSERVABLEMENT
 * "aujourd'hui" (ou "hier", etc.) dans une assertion de section doit être
 * ancré via `recentTodayAnchor`/`recentMinutesBefore` ci-dessous, jamais via
 * ce décalage purement relatif à `Date.now()`.
 */
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

const PARIS_TIME_ZONE = 'Europe/Paris';

/** Jour calendaire DE PARIS pour un instant donné — même mécanique que `localCalendarDate` (`conversation-sections.ts`), non exportée par la loi et dupliquée ici pour les fixtures uniquement. */
const parisCalendarDate = (date: Date): { readonly year: number; readonly month: number; readonly day: number } => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type: 'year' | 'month' | 'day'): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
};

/**
 * L'ancre "récent, forcément aujourd'hui à Paris" (#5769). Calcule le jour
 * calendaire DE PARIS pour l'instant réel puis y ancre 10 h UTC — toujours
 * 11 h (heure d'hiver) ou 12 h (heure d'été) à Paris, jamais à moins de 9 h
 * d'un minuit local dans un sens comme dans l'autre : insensible à l'heure
 * réelle d'exécution du test, tout en restant DYNAMIQUE (le jour avance
 * chaque jour, comme `minutesAgo` — jamais une date figée, cf. `fixtures.ts`
 * sur la raison de ce choix).
 */
export const recentTodayAnchor = (): Date => {
  const { year, month, day } = parisCalendarDate(new Date());
  return new Date(Date.UTC(year, month - 1, day, 10, 0, 0));
};

/** Décale depuis `anchor` exactement comme `minutesAgo` décale depuis `Date.now()` — l'ORDRE relatif d'un fil qui l'utilise partout reste inchangé. */
export const recentMinutesBefore = (anchor: Date, minutes: number): Date =>
  new Date(anchor.getTime() - minutes * 60_000);

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
