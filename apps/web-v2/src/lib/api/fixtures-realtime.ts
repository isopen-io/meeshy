import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';

import { CONVERSATION_ID, VIEWER_ID } from './fixtures-base';
import { LIVE_1, LIVE_CONVERSATION_ID } from './fixtures-live';

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

const liveTyping = (userId: 'u-kwame' | 'u-fatou', isTyping: boolean) => ({
  userId,
  username: userId === 'u-kwame' ? 'kwame.mensah' : 'fatou.ba',
  ...(isTyping ? { displayName: userId === 'u-kwame' ? 'Kwame Mensah' : 'Fatou Bâ' } : {}),
  conversationId: LIVE_CONVERSATION_ID,
  isTyping,
});

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
          timeouts.push(setTimeout(() => fire(entry.event, entry.payload), entry.atMs));
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
