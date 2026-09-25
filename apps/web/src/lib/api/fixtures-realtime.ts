import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';

import type { Conversation } from './types';
import { CONVERSATION_ID, VIEWER_ID, conversationDefaults, kwame, viewer } from './fixtures-base';
import { recordSurgedConversation } from './fixtures';
import {
  LIVE_1,
  LIVE_3_ATTACHMENT_ID,
  LIVE_3_AUDIO_URL,
  LIVE_3_CREATED_AT,
  LIVE_3_ID,
  LIVE_CONVERSATION_ID,
} from './fixtures-live';
import { MEDIA_IMAGE_DATA_URI } from './fixtures-media';

/**
 * LE BOUCHON DE FIXTURES (#5793, § 3.5 de la spécification ; étendu #6171,
 * § 5 étape 6) — le SEUL `SocketFactory` qu'une source `fixtures` instancie
 * (`api/realtime.ts`). Élagué sous `VITE_DATA_SOURCE=gateway` (`vite.config.ts`
 * § `FIXTURE_MODULE` : ce fichier commence par `fixtures`, donc `__FIXTURES__`
 * fait disparaître toute référence à `createFixturesSocketClient` d'un build
 * `gateway`).
 *
 * Rejoue, aux MÊMES noms et aux MÊMES formes que la passerelle réelle,
 * `authenticated` SYNCHRONE à `connect()` (copié de `AuthHandler.ts:364-368`)
 * puis UNE CHRONOLOGIE de faits (`SCHEDULE` ci-dessous) — DONNÉE, pas
 * comportement : chaque entrée est soit UN COUP (`kind: 'once'`, `atMs`
 * depuis `connect()`) soit RÉPÉTÉE (`kind: 'repeat'`, `everyMs`). Les DEUX
 * FAMILLES coexistent dans la MÊME table — le keepalive de frappe d'Amina
 * (3 s sur « Équipe déploiement », existant, `check-typing-visibility.mjs`
 * en dépend MOT POUR MOT) et la chronologie de `c-live` (#6171, roster
 * multi-frappeurs + Prisme temps réel, `check-realtime-events.mjs`).
 *
 * `emit` est un NO-OP : les fixtures n'ont aucun correspondant réel à qui
 * parler — un `typing:start` émis ici n'aurait aucun consommateur, jamais
 * une boucle vers soi-même.
 */
type ScheduledFixtureEvent =
  | { readonly kind: 'once'; readonly atMs: number; readonly event: string; readonly payload: unknown }
  | { readonly kind: 'repeat'; readonly everyMs: number; readonly event: string; readonly payload: unknown };

const TYPING_KEEPALIVE_MS = 3000;

/** Les traductions de `live-1` (#6171) — les MÊMES formes que
 * `buildTranslationEvent.ts:75-84` : `id = ${messageId}_${target}_${atMs}`,
 * `cacheKey = ${messageId}_${source}_${target}`. */
const liveTranslation = (params: {
  readonly atMs: number;
  readonly targetLanguage: string;
  readonly translatedContent: string;
}) => ({
  messageId: LIVE_1.id,
  translations: [
    {
      id: `${LIVE_1.id}_${params.targetLanguage}_${params.atMs}`,
      messageId: LIVE_1.id,
      sourceLanguage: 'es',
      targetLanguage: params.targetLanguage,
      translatedContent: params.translatedContent,
      translationModel: 'medium',
      cacheKey: `${LIVE_1.id}_es_${params.targetLanguage}`,
      cached: false,
    },
  ],
});

/**
 * LES TROIS TEMPS DU PIPELINE AUDIO (#7017) — la charge de
 * `message:attachment-updated` telle que la passerelle la sert : la pièce
 * ENTIÈRE passée par `serializeAttachmentForSocket`, jamais un delta.
 *
 * Elle PORTE les trois canaux de protection à leur valeur ORDINAIRE, et ce
 * n'est pas une commodité de fixture : c'est la forme MESURÉE de la
 * passerelle depuis que #7014 a atterri (merge `4511c5e780` sur `dev`).
 * `serializeAttachmentForSocket` (`services/gateway/src/socketio/`) RÉPAND
 * `attachmentProtectionOf(raw)` en DERNIER — fail-closed, donc toujours
 * présent — et `emitAttachmentUpdated` est nourri par `attachmentSocketSelect`
 * (`attachmentMediaSelect` PLUS la protection), jamais par le select nu.
 *
 * Le doc-comment précédent affirmait l'inverse, en le datant : « relevé sur
 * `dev` au 2026-09-18 : ni `attachmentSocketSelect` ni
 * `ATTACHMENT_PROTECTION_FIELDS` n'existent — #7014 n'a PAS atterri ». C'était
 * vrai ce jour-là et faux le lendemain. Le témoin d'à côté
 * (`fixtures-realtime.test.ts`) était posé EXPRÈS comme le cliquet qui oblige
 * à revenir ici ; il a rougi, et la fixture a suivi — « un gate qui rejoue une
 * charge impossible ne mesure pas le produit » vaut dans les DEUX sens.
 *
 * La charge la plus PAUVRE — celle où le cache est le seul à savoir qu'une
 * pièce est masquée — reste exercée, mais par l'unitaire qui en a la charge
 * (`realtime-apply-attachment.test.ts`) et par la loi partagée
 * (`raisedAttachmentProtection`, `packages/shared/utils/attachment-protection.ts`) :
 * une FIXTURE doit rejouer ce que la passerelle ÉMET, jamais un pire cas
 * qu'elle n'émet plus.
 *
 * `translations` est CUMULATIVE : le serveur relit la ligne après chaque
 * enrichissement, donc l'évènement `fr` porte aussi `en`
 * (`emitAttachmentUpdated.ts:60-64` : « clients REPLACE the attachment's
 * translation map with what this event carries »).
 */
const liveTranscript = (params: {
  readonly transcription: { readonly type: 'audio'; readonly text: string; readonly language: string };
  readonly translations: Readonly<Record<string, { readonly type: 'audio'; readonly transcription: string }>>;
}) => ({
  conversationId: LIVE_CONVERSATION_ID,
  messageId: LIVE_3_ID,
  attachment: {
    id: LIVE_3_ATTACHMENT_ID,
    messageId: LIVE_3_ID,
    fileName: 'nota.wav',
    originalName: 'nota-de-voz.wav',
    mimeType: 'audio/wav',
    fileSize: 16_044,
    fileUrl: LIVE_3_AUDIO_URL,
    duration: 9_000,
    capturedInApp: false,
    createdAt: LIVE_3_CREATED_AT,
    transcription: params.transcription,
    translations: params.translations,
    reactionSummary: {},
    currentUserReactions: [],
    /* LES TROIS CANAUX, TOUJOURS SERVIS — `attachmentProtectionOf` est
       fail-closed, donc la passerelle ne peut PAS les omettre. `live-3` est
       une pièce ordinaire : leurs valeurs sont celles des colonnes à défaut
       (`schema.prisma` — `Boolean @default(false)`, `Int @default(0)`). */
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
  },
});

const LIVE_TRANSCRIPTION_ES = {
  type: 'audio',
  text: 'Hola, ¿seguimos con la revisión el jueves?',
  language: 'es',
} as const;

const liveTyping = (userId: 'u-kwame' | 'u-fatou', isTyping: boolean) => ({
  userId,
  username: userId === 'u-kwame' ? 'kwame.mensah' : 'fatou.ba',
  ...(isTyping ? { displayName: userId === 'u-kwame' ? 'Kwame Mensah' : 'Fatou Bâ' } : {}),
  conversationId: LIVE_CONVERSATION_ID,
  isTyping,
});

/**
 * UNE ARRIVÉE DE MÉDIA SUR `c-live` (#7014) — la forme que
 * `serializeAttachmentForSocket` SERT, drapeaux de protection compris.
 *
 * Rend un TABLEAU d'une entrée pour se répandre dans la table : la chronologie
 * est de la DONNÉE (doc-comment du module), et un helper qui ajouterait ses
 * entrées par effet de bord la rendrait illisible à qui la LIT — ce que
 * `LIVE_SCHEDULE` est exportée pour permettre (#6807).
 *
 * `messageType: 'image'`, `content: ''` : le média est TOUT le message, motif
 * `media-10`. Le `<img>` ne peut donc pas être caché par un texte qui
 * l'accompagnerait — ce qui rendrait le témoin ambigu.
 */
const liveMediaArrival = (params: {
  readonly id: string;
  readonly atMs: number;
  readonly isViewOnce: boolean;
}): readonly ScheduledFixtureEvent[] => [
  {
    kind: 'once',
    atMs: params.atMs,
    event: SERVER_EVENTS.MESSAGE_NEW,
    payload: {
      id: params.id,
      conversationId: LIVE_CONVERSATION_ID,
      senderId: 'u-kwame',
      sender: { id: 'u-kwame', username: 'kwame.mensah', displayName: 'Kwame Mensah' },
      content: '',
      originalLanguage: 'fr',
      messageType: 'image',
      createdAt: new Date(LIVE_1.createdAt.getTime() + params.atMs).toISOString(),
      translations: [],
      attachments: [
        {
          id: `${params.id}-a1`,
          messageId: params.id,
          fileName: 'capture.png',
          originalName: 'capture-privee.png',
          mimeType: 'image/png',
          fileSize: 96,
          fileUrl: MEDIA_IMAGE_DATA_URI,
          width: 1200,
          height: 800,
          createdAt: new Date(LIVE_1.createdAt.getTime() + params.atMs).toISOString(),
          transcription: null,
          translations: null,
          capturedInApp: false,
          /* LES TROIS DRAPEAUX, TOUJOURS SERVIS — c'est ce que le lot a
             corrigé côté passerelle. Les servir ICI aussi est le POINT : une
             charge qui les tairait est la forme EXACTE du défaut, et la
             mutation qui doit faire rougir le gate. */
          isViewOnce: params.isViewOnce,
          isBlurred: false,
          effectFlags: 0,
        },
      ],
    },
  },
];

/**
 * LA CHRONOLOGIE DE `c-live` (#6171) — mesurée depuis `connect()`, jamais
 * depuis un instant de fixture (§5 étape 6/8 de la spécification) :
 *
 *  2 000 ms — `live-1` reçoit sa traduction ANGLAISE.
 *  3 500 ms — `live-1` reçoit sa traduction FRANÇAISE (les deux COEXISTENT,
 *             `mergeMessageTranslations` fusionne par langue).
 *  4 500 ms — `conversation:updated` ADOPTE `live-1` (suppression pour tous
 *             du dernier message visible, `live-2` — motif
 *             `emitConversationPreviewUpdate.ts:379-384`, `previewRecalculated: true`).
 *  6 000/9 000/12 000 ms — Kwame retape (keepalive 3 s) puis SE TAIT : son
 *             échéance de sécurité (15 s) tombe à 27 000 ms sans `typing:stop`.
 *  7 500/10 500 ms — Fatou retape.
 *  13 000 ms — Fatou s'arrête EXPLICITEMENT.
 */
/**
 * EXPORTÉE POUR ÊTRE INTERROGÉE (#6807) — cette table est de la DONNÉE, pas du
 * comportement (voir le doc-comment du module). Un témoin qui voudrait prouver
 * la présence d'une entrée tardive en ATTENDANT son minuteur paierait son
 * `atMs` en secondes réelles : le gate navigateur, lui, avance sur une horloge
 * simulée (`page.clock.runFor`) où 14 s ne coûtent rien. La donnée se lit, le
 * comportement s'observe au navigateur — chacun son niveau.
 */
export const LIVE_SCHEDULE: readonly ScheduledFixtureEvent[] = [
  /**
   * `message:attachment-updated` × 3 (#7017) — LE PIPELINE AUDIO EN TROIS
   * TEMPS, aux instants qui tombent JUSTE AVANT les arrêts d'horloge que
   * `check-realtime-events.mjs` observait déjà (T+0,3 s, T+2,5 s, T+4 s,
   * T+5 s) : le gate n'avance pas d'une milliseconde de plus pour les lire, et
   * son compteur `messageFetches`, asserté à T+4 s, couvre ces trois
   * évènements — c'est ce qui PROUVE le « sans rechargement ».
   *
   * 1 500 ms — Whisper : la transcription ESPAGNOLE seule ⇒ le fil sert
   *            l'ORIGINAL (`lang="es"`).
   * 3 000 ms — NLLB, première langue : `en` ⇒ **RANG 2** du prisme du lecteur
   *            (`['fr','en']` sous `locale: 'en-US'`). Un témoin de rang ne
   *            s'écrit pas sur le rang 1, où une descente juste et un
   *            court-circuit rendent le même verdict (CLAUDE.md § Prisme,
   *            leçon 261).
   * 4 200 ms — NLLB, seconde langue : `fr` REPREND LA MAIN au rang 1.
   */
  {
    kind: 'once',
    atMs: 1500,
    event: SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED,
    payload: liveTranscript({ transcription: LIVE_TRANSCRIPTION_ES, translations: {} }),
  },
  {
    kind: 'once',
    atMs: 3000,
    event: SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED,
    payload: liveTranscript({
      transcription: LIVE_TRANSCRIPTION_ES,
      translations: { en: { type: 'audio', transcription: 'Hi, shall we keep the review on Thursday?' } },
    }),
  },
  {
    kind: 'once',
    atMs: 4200,
    event: SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED,
    payload: liveTranscript({
      transcription: LIVE_TRANSCRIPTION_ES,
      translations: {
        en: { type: 'audio', transcription: 'Hi, shall we keep the review on Thursday?' },
        fr: { type: 'audio', transcription: 'Bonjour, on garde la revue jeudi ?' },
      },
    }),
  },
  { kind: 'once', atMs: 2000, event: SERVER_EVENTS.MESSAGE_TRANSLATION, payload: liveTranslation({ atMs: 2000, targetLanguage: 'en', translatedContent: 'Hi, is the review still on Thursday?' }) },
  { kind: 'once', atMs: 3500, event: SERVER_EVENTS.MESSAGE_TRANSLATION, payload: liveTranslation({ atMs: 3500, targetLanguage: 'fr', translatedContent: 'Bonjour, la revue reste bien jeudi ?' }) },
  {
    kind: 'once',
    atMs: 4500,
    event: SERVER_EVENTS.CONVERSATION_UPDATED,
    payload: {
      conversationId: LIVE_CONVERSATION_ID,
      updatedBy: { id: 'u-kwame' },
      updatedAt: new Date(LIVE_1.createdAt.getTime() + 4500).toISOString(),
      lastMessageId: LIVE_1.id,
      lastMessageAt: LIVE_1.createdAt.toISOString(),
      lastMessagePreview: LIVE_1.content,
      lastMessageOriginalLanguage: 'es',
      lastMessageTranslations: { fr: 'Bonjour, la revue reste bien jeudi ?', en: 'Hi, is the review still on Thursday?' },
      senderId: 'p-kwame',
      lastMessageSenderName: 'Kwame Mensah',
      lastMessageAttachments: [],
      lastMessageAttachmentCount: 0,
      lastMessageIsBlurred: false,
      lastMessageIsViewOnce: false,
      lastMessageExpiresAt: null,
      previewRecalculated: true,
    },
  },
  { kind: 'once', atMs: 6000, event: SERVER_EVENTS.TYPING_START, payload: liveTyping('u-kwame', true) },
  { kind: 'once', atMs: 7500, event: SERVER_EVENTS.TYPING_START, payload: liveTyping('u-fatou', true) },
  { kind: 'once', atMs: 9000, event: SERVER_EVENTS.TYPING_START, payload: liveTyping('u-kwame', true) },
  { kind: 'once', atMs: 10500, event: SERVER_EVENTS.TYPING_START, payload: liveTyping('u-fatou', true) },
  { kind: 'once', atMs: 12000, event: SERVER_EVENTS.TYPING_START, payload: liveTyping('u-kwame', true) },
  { kind: 'once', atMs: 13000, event: SERVER_EVENTS.TYPING_STOP, payload: liveTyping('u-fatou', false) },
  /**
   * `conversation:new` (#6807, suite de #6799) — LA CONVERSATION QUI SURGIT.
   *
   * `socket.ts` s'y abonne depuis #6799 et invalide la liste ; sans une source
   * capable d'émettre l'évènement, aucun gate ne peut prouver que cet
   * abonnement sert à quelque chose — un correctif que rien n'exerce est
   * indistinguable d'un correctif absent.
   *
   * La charge suit `ConversationNewEventData` MOT POUR MOT
   * (`packages/shared/types/socketio-events/conversation.ts:67-74`) : le
   * bouchon rejoue « aux MÊMES noms et aux MÊMES formes que la passerelle
   * réelle », donc une forme approximative ferait passer un gate que la vraie
   * passerelle ferait tomber.
   *
   * `c-surgie` est ABSENTE du corpus `CONVERSATIONS` (`fixtures.ts:458`) — et
   * c'est le POINT : la ligne ne peut pas être patchée par
   * `patchConversation`, qui ne touche qu'une page portant déjà l'id. C'est
   * exactement la situation que #6799 corrige.
   *
   * DERNIER de la chronologie (`atMs: 14000`, après le `typing:stop` à 13 s) :
   * l'invalidation qu'il déclenche refait `GET /conversations`, et placée plus
   * tôt elle traverserait les assertions de `check-realtime-events.mjs` sur la
   * ligne 2 de `c-live` (T+0,3 s → T+6,5 s), qui mesurent un cache que ce
   * refetch reconstruirait sous elles.
   */
  {
    kind: 'once',
    atMs: 14000,
    event: SERVER_EVENTS.CONVERSATION_NEW,
    payload: {
      conversationId: 'c-surgie',
      conversationType: 'direct',
      title: null,
      creatorId: 'u-kwame',
      participantIds: ['u-kwame', VIEWER_ID],
      createdAt: new Date(LIVE_1.createdAt.getTime() + 14000).toISOString(),
    },
  },

  /**
   * `live-ordinaire` / `live-protege` (#7014) — LA PIÈCE PROTÉGÉE REÇUE EN
   * TEMPS RÉEL, que rien ne jouait.
   *
   * `media-10` (`fixtures-media.ts`) porte déjà la MÊME forme — la PIÈCE
   * déclarée `isViewOnce` sur un message ORDINAIRE — mais sur le chemin REST,
   * où le `select` du serveur sert bien ses drapeaux. Ce gate-là était VERT
   * pendant toute la vie du défaut : `serializeAttachmentForSocket` énumérait
   * trente champs à la main, sans les trois de la protection, et
   * `maskedAttachment` échoue OUVERTE quand on ne la nourrit pas. Une photo à
   * VUE UNIQUE arrivée par `message:new` rendait donc son `<img>` EN CLAIR
   * jusqu'au prochain `GET /messages`.
   *
   * LES DEUX MESSAGES NE DIFFÈRENT QUE PAR LA DÉCLARATION — même média, même
   * expéditeur, même arrivée. Sans le second, un fil qui cesserait de monter
   * les messages reçus par socket ferait passer le premier pour une garde qui
   * tient (leçon 261) ; et c'est le message ORDINAIRE qui donne au gate l'URL
   * à traquer dans la bulle protégée, plutôt qu'un littéral recopié là-bas.
   *
   * APRÈS `conversation:new` (14 000 ms) : ces deux messages PATCHENT la ligne
   * 2 de `c-live`, que les assertions de la liste mesurent jusqu'à T+6,5 s, et
   * les placer plus tôt les ferait lire un aperçu que ce lot aurait déplacé.
   *
   * La charge suit ce que `serializeAttachmentForSocket` SERT — drapeaux de
   * protection compris, ce qui est précisément l'objet du lot. C'est une
   * FIXTURE : elle prouve la moitié CLIENT du fail-closed (le fil rend-il la
   * pièce déclarée ?), jamais que la passerelle sert bien ces champs — cette
   * moitié-là est tenue par la garde d'inventaire
   * (`serializeAttachmentForSocket.test.ts`) et par le témoin bout-à-bout
   * (`realtime-attachment-protection.test.tsx`), qui importe le VRAI
   * sérialiseur.
   */
  ...liveMediaArrival({ id: 'live-ordinaire', atMs: 30000, isViewOnce: false }),
  ...liveMediaArrival({ id: 'live-protege', atMs: 31000, isViewOnce: true }),

  /**
   * LA RÉACTION D'UN AUTRE, L'ÉDITION ET LA SUPPRESSION EN DIRECT (#5863,
   * #7926) — aux formes que la passerelle émet (`ReactionService.
   * createUpdateEvent`, `buildMessageEditedCore`, `MessageDeletedEventData`).
   * APRÈS tout ce que `check-realtime-events.mjs` mesure (≤ 31 s) : aucune
   * assertion existante ne lit un fil que ces trois faits auraient déplacé.
   */
  {
    kind: 'once',
    atMs: 45000,
    event: SERVER_EVENTS.REACTION_ADDED,
    payload: {
      messageId: 'live-2',
      conversationId: LIVE_CONVERSATION_ID,
      participantId: 'p-kwame',
      userId: 'u-kwame',
      emoji: '👍',
      action: 'add',
      aggregation: { emoji: '👍', count: 1, participantIds: ['p-kwame'] },
      timestamp: new Date(LIVE_1.createdAt.getTime() + 45000).toISOString(),
    },
  },
  {
    kind: 'once',
    atMs: 46000,
    event: SERVER_EVENTS.MESSAGE_EDITED,
    payload: {
      id: 'live-2',
      conversationId: LIVE_CONVERSATION_ID,
      senderId: VIEWER_ID,
      content: 'Oui, vendredi 14h.',
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: new Date(LIVE_1.createdAt.getTime() + 10 * 60_000).toISOString(),
      updatedAt: new Date(LIVE_1.createdAt.getTime() + 46000).toISOString(),
      isEdited: true,
      editedAt: new Date(LIVE_1.createdAt.getTime() + 46000).toISOString(),
      translations: [],
    },
  },
  {
    kind: 'once',
    atMs: 47000,
    event: SERVER_EVENTS.MESSAGE_DELETED,
    payload: { messageId: LIVE_1.id, conversationId: LIVE_CONVERSATION_ID },
  },
];

const SCHEDULE: readonly ScheduledFixtureEvent[] = [
  {
    kind: 'repeat',
    everyMs: TYPING_KEEPALIVE_MS,
    event: SERVER_EVENTS.TYPING_START,
    payload: {
      userId: 'u-amina',
      username: 'amina.diallo',
      displayName: 'Amina Diallo',
      conversationId: CONVERSATION_ID,
      isTyping: true,
    },
  },
  ...LIVE_SCHEDULE,
];

/**
 * L'EFFET D'UNE ENTRÉE TIRÉE, HORS DE L'HORLOGE (#6807) — extraite pour être
 * testable : l'entrée `conversation:new` est à `atMs: 14000`, et un témoin qui
 * l'attendrait paierait 14 s RÉELLES (le bouchon arme de vrais `setTimeout` ;
 * seul le gate navigateur avance sur une horloge simulée). Appelée par
 * `connect()` AVANT `fire`, jamais après : le client réagit à l'évènement en
 * invalidant la liste, donc la conversation doit déjà être dans le corpus
 * quand le refetch part — sinon la page revient sans elle et le gate mesure
 * une course plutôt qu'une règle.
 */
export function recordSurgedFromEntry(entry: ScheduledFixtureEvent): void {
  if (entry.event !== SERVER_EVENTS.CONVERSATION_NEW) return;
  const payload = entry.payload as { readonly conversationId: string; readonly createdAt: string };
  const at = new Date(payload.createdAt);

  /* Les TROIS dates portent la même valeur : sans message, le serveur ne
     touche plus `lastMessageAt` après la création (même raisonnement que
     `c-nouvelle` dans le corpus). `updatedAt` explicite car
     `conversationDefaults` le pose à « maintenant », ce qui ferait remonter
     cette ligne au-dessus de conversations plus vivantes quand
     `orderConversations` l'emploie en repli. */
  recordSurgedConversation({
    ...conversationDefaults,
    id: payload.conversationId,
    type: 'direct',
    memberCount: 2,
    /* Le LECTEUR est participant : une ligne servie à quelqu'un qui
       n'appartient pas à la conversation serait une fuite, pas une fixture. */
    participants: [viewer, kwame],
    unreadCount: 0,
    createdAt: at,
    updatedAt: at,
    lastMessageAt: at,
  } as Conversation);
}

export const createFixturesSocketClient: SocketFactory = () => {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  const timeouts: ReturnType<typeof setTimeout>[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];

  const fire = (event: string, payload: unknown): void => {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };

  const clearAllTimers = (): void => {
    for (const handle of timeouts.splice(0)) clearTimeout(handle);
    for (const handle of intervals.splice(0)) clearInterval(handle);
  };

  const client: SocketClient = {
    get connected() {
      return connected;
    },
    connect: () => {
      if (connected) return;
      connected = true;
      fire(SERVER_EVENTS.AUTHENTICATED, {
        success: true,
        user: { id: VIEWER_ID, language: 'fr', isAnonymous: false },
        version: 'fixtures',
      });
      for (const entry of SCHEDULE) {
        if (entry.kind === 'repeat') {
          intervals.push(setInterval(() => fire(entry.event, entry.payload), entry.everyMs));
        } else {
          timeouts.push(
            setTimeout(() => {
              /* AVANT `fire`, jamais après : le client réagit à
                 `conversation:new` en INVALIDANT la liste, donc la conversation
                 doit déjà être dans le corpus quand le refetch part. L'ordre
                 inverse rendrait une page sans elle, et le gate mesurerait une
                 course au lieu d'une règle. */
              recordSurgedFromEntry(entry);
              fire(entry.event, entry.payload);
            }, entry.atMs),
          );
        }
      }
    },
    disconnect: () => {
      connected = false;
      clearAllTimers();
    },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => {
      /* Voir le doc-comment du fichier — aucun correspondant réel. */
    },
  };
  return client;
};
