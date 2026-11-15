/**
 * L'OUVERTURE DU SALON RIVIÈRE — le corpus de la LOI, jamais du fil (#5696,
 * travail `river`, étape 4b).
 *
 * **CE MODULE N'EST IMPORTÉ PAR AUCUN MODULE DE PRODUCTION, ET C'EST SA
 * RAISON D'ÊTRE.** Tant que ces douze messages vivaient dans
 * `fixtures-river.ts` — que `fixtures.ts` importe, donc que le chunk
 * `reader` embarque — ils PARTAIENT chez chaque lecteur : `RIVER_OPENING_
 * MESSAGES` naît d'appels à `message()` au niveau du module, que Rollup ne
 * peut pas prouver purs, donc qu'il ne peut pas élaguer (mesuré le
 * 2026-09-08 : « riv-open », « Léa Rivière » et les neuf voix étaient dans
 * `dist/assets/reader-*.js`). Un corpus que AUCUNE route ne sert n'a rien à
 * faire dans le paquet servi — revue-correction #5696.
 *
 * Il reste une page PLUS ANCIENNE de la MÊME conversation
 * (`RIVER_CONVERSATION_ID`), servie UNIQUEMENT aux témoins de la loi
 * (`fixtures-river.test.ts`) : `messagesOf('c-salon-riviere')` et
 * `hasOlderMessagesOf('c-salon-riviere')` restent INCHANGÉS — le fil n'a
 * aujourd'hui aucune rangée pour un avis système
 * (`reading-mode/protection.ts`) ni le troisième critère de regroupement
 * (`grouping.ts`) : un avis rendu en Focal s'afficherait comme une parole de
 * Léa. Câbler cette page dans le fil est le travail 2 (ou une issue « avis
 * système en rangée plate ») — sans quoi la Rivière RENDUE sur le corpus que
 * `messagesOf` sert (deux voix strictes) sera toujours `serialized`.
 */
import type { JoinNoticeMetadata } from '@meeshy/shared/utils/join-notice';

import type { Message, Participant } from './types';
import { VIEWER_ID, amina, bruno, dayAt, fatou, kwame, message, participantDefaults, viewer } from './fixtures-base';
import { RIVER_CONVERSATION_ID } from './fixtures-river';

/**
 * POURQUOI CETTE PAGE EXISTE. Le Salon Rivière (`RIVER_MESSAGES`, 40
 * messages) n'a que DEUX voix (`viewer`/`amina` en stricte alternance) :
 * `resolveRiverGeometry` y rend `serialized/belowMinimum` à TOUS les
 * barreaux de l'échelle (mesuré le 2026-09-08, exécution directe de
 * `river-lanes.js` — voir `fixtures-river.test.ts`, témoin « les 40 messages
 * seuls ne peuvent pas faire tomber ce témoin »). C'est le « corpus qui ne
 * peut pas faire échouer un témoin ne peut pas le valider » (leçon,
 * `tasks/lessons.md`, `targets/riviere.md:52-57`) : sans une page qui
 * ATTEINT les couloirs, aucun témoin de FORME (`lanes`, connecteurs
 * croisés, débordement, avis système) ne peut jamais tomber sur ce corpus.
 *
 * `RIVER_OPENING_MESSAGES` est une page PLUS ANCIENNE de la MÊME
 * conversation — hier matin (`dayAt(1, 9, m)`), jamais aujourd'hui — servie
 * UNIQUEMENT aux témoins de la loi (`fixtures-river.test.ts`,
 * `geometry.test.ts`) : `messagesOf('c-salon-riviere')` et
 * `hasOlderMessagesOf('c-salon-riviere')` restent INCHANGÉS (§9.3 de la
 * spécification #5696) — le fil n'a aujourd'hui aucune rangée pour un avis
 * système (`reading-mode/protection.ts:46-48`) ni le troisième critère de
 * regroupement (`grouping.ts`) : un avis rendu en Focal s'afficherait comme
 * une parole de Léa. Câbler cette page dans le fil est le travail 2 (ou une
 * issue « avis système en rangée plate »).
 *
 * NEUF VOIX (`viewer`, `amina`, `kwame`, `fatou`, `bruno`, `léa`, `malik`,
 * `sofia`, `noé`), un AVIS SYSTÈME (Léa rejoint — l'arrivante en est
 * l'auteure, `join-notice.ts:31`), DEUX RÉPONSES CROISÉES (`riv-open-3` →
 * `riv-open-0`, `riv-open-10` → `riv-open-3`), et un PASSAGE À PLUS DE SEPT
 * VOIX entre `riv-open-2` et `riv-open-9` (8 voix hors lecteur en 8
 * minutes) — mesuré le 2026-09-08 (script de scratchpad, échelle miroir de
 * `RiverConversationMapping.swift:153-164`) : le corpus COMPLET
 * (ouverture + 40) rend `layout: 'lanes'`, `voiceCount: 9`, à la fenêtre
 * retenue par la recherche (2 minutes, `laneCount: 6`) ; la tranche
 * `riv-open-2..9` seule, à la fenêtre PAR DÉFAUT, rend
 * `serializationReason: 'aboveMaximum'` (8 voix hors lecteur) ; les 40
 * messages seuls restent `serialized/belowMinimum` à tous les barreaux.
 */
const lea: Participant = { ...participantDefaults, id: 'p-lea', userId: 'u-lea', displayName: 'Léa Rivière', isOnline: false, lastActiveAt: dayAt(1, 9, 6) };
const malik: Participant = { ...participantDefaults, id: 'p-malik', userId: 'u-malik', displayName: 'Malik Sow', isOnline: false, lastActiveAt: dayAt(1, 9, 7) };
const sofia: Participant = { ...participantDefaults, id: 'p-sofia', userId: 'u-sofia', displayName: 'Sofia Ndiaye', isOnline: false, lastActiveAt: dayAt(1, 9, 8) };
const noe: Participant = { ...participantDefaults, id: 'p-noe', userId: 'u-noe', displayName: 'Noé Camara', isOnline: false, lastActiveAt: dayAt(1, 9, 9) };

const LEA_JOIN_NOTICE: JoinNoticeMetadata = {
  kind: 'member-joined',
  participantId: lea.id,
  displayName: lea.displayName,
  isAnonymous: false,
  viaShareLink: false,
};

/** `conversationId` réécrit EXPLICITEMENT sur chaque entrée — même discipline que `catchupMessage()` (`fixtures-catchup.ts`). */
const riverOpeningMessage = (partial: Parameters<typeof message>[0]): Message =>
  message({ ...partial, conversationId: RIVER_CONVERSATION_ID });

export const RIVER_OPENING_MESSAGES: readonly Message[] = [
  riverOpeningMessage({
    id: 'riv-open-0',
    senderId: VIEWER_ID,
    sender: viewer,
    content: "J'ouvre le salon : neuf voix ce matin, on fera le tri.",
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 0),
  }),
  riverOpeningMessage({
    id: 'riv-open-1',
    senderId: lea.userId ?? 'u-lea',
    sender: lea,
    messageSource: 'system',
    content: 'Léa Rivière a rejoint la conversation',
    originalLanguage: 'fr',
    translations: [],
    metadata: LEA_JOIN_NOTICE,
    createdAt: dayAt(1, 9, 1),
  }),
  riverOpeningMessage({
    id: 'riv-open-2',
    senderId: amina.userId ?? 'u-amina',
    sender: amina,
    content: 'Je vous écoute, allez-y.',
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 2),
  }),
  riverOpeningMessage({
    id: 'riv-open-3',
    senderId: kwame.userId ?? 'u-kwame',
    sender: kwame,
    replyToId: 'riv-open-0',
    content: "Je note, je préviens l'équipe design tout de suite.",
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 3),
  }),
  riverOpeningMessage({
    id: 'riv-open-4',
    senderId: fatou.userId ?? 'u-fatou',
    sender: fatou,
    content: 'Moi je peux prendre les retours du côté support.',
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 4),
  }),
  riverOpeningMessage({
    id: 'riv-open-5',
    senderId: bruno.userId ?? 'u-bruno',
    sender: bruno,
    content: 'Présent aussi, je regarde les métriques ce matin.',
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 5),
  }),
  riverOpeningMessage({
    id: 'riv-open-6',
    senderId: lea.userId ?? 'u-lea',
    sender: lea,
    content: 'Merci de l’accueil, je me lance sur la traduction.',
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 6),
  }),
  riverOpeningMessage({
    id: 'riv-open-7',
    senderId: malik.userId ?? 'u-malik',
    sender: malik,
    content: 'Salut à tous, je rejoins la revue en cours.',
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 7),
  }),
  riverOpeningMessage({
    id: 'riv-open-8',
    senderId: sofia.userId ?? 'u-sofia',
    sender: sofia,
    content: 'Bonjour, je prends les notes de la session.',
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 8),
  }),
  riverOpeningMessage({
    id: 'riv-open-9',
    senderId: noe.userId ?? 'u-noe',
    sender: noe,
    content: 'Et moi je surveille le canal support en parallèle.',
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 9),
  }),
  riverOpeningMessage({
    id: 'riv-open-10',
    senderId: amina.userId ?? 'u-amina',
    sender: amina,
    replyToId: 'riv-open-3',
    content: 'Kwame, je te rejoins sur ce point.',
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 10),
  }),
  riverOpeningMessage({
    id: 'riv-open-11',
    senderId: VIEWER_ID,
    sender: viewer,
    content: 'Parfait, on est au complet — on peut commencer le tri.',
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(1, 9, 12),
  }),
];
