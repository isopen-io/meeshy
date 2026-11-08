/**
 * L'émission de `message:new` GROUPÉE PAR LANGUE — le site unique, extrait des
 * deux jumelles `MessageHandler._emitMessageNewByLanguage` (transport socket)
 * et `MeeshySocketIOManager._emitMessageNewByLanguage` (REST/ZMQ) par #17086.
 *
 * ─── Pourquoi un module, et pas deux méthodes ────────────────────────────────
 *
 * Les deux portaient la même doctrine multi-nœud, recopiée dans deux
 * commentaires de vingt lignes — et elles avaient DÉJÀ divergé : la jumelle
 * REST/ZMQ ignorait `excludeSocketId` (donc ne savait pas exclure un expéditeur
 * ANONYME de son propre élagage) et prenait `Record<string, any>`, c'est-à-dire
 * aucune charge gouvernée. Une règle qui doit être retapée à chaque site est
 * une règle qu'un site finira par ne pas avoir.
 *
 * La version retenue est la PLUS RICHE (celle du transport socket) : élargir
 * l'appelant REST/ZMQ ne lui retire rien — il ne passe pas `excludeSocketId`,
 * et le bloc de mesure reste gaté par `SOCKET_LANG_FILTER`.
 *
 * ─── La doctrine multi-nœud, écrite UNE fois ─────────────────────────────────
 *
 * `adapter.rooms` et les cartes `connectedUsers` / `socketToUser` ne voient que
 * les sockets de CE nœud. Sur un déploiement multi-nœuds (la topologie 100k+
 * msg/s fait tourner l'adaptateur Redis), un destinataire branché sur une autre
 * passerelle n'est jamais énuméré ici : la boucle par langue, qui ne résout que
 * du local, ne le servirait JAMAIS. D'où l'ordre :
 *
 * 1. diffuser la charge ENTIÈRE à la room à travers le cluster (l'adaptateur
 *    Redis propage `io.to(room)`), en exceptant tous les sockets LOCAUX — que
 *    la boucle sert ensuite avec une copie élaguée — plus l'expéditeur ;
 * 2. une émission élaguée par groupe de langue, vers les sockets locaux.
 *
 * Un socket distant reçoit donc exactement un `message:new` (non filtré), un
 * socket local exactement une copie élaguée. Sur un nœud unique, l'exception
 * couvre toute la room et l'étape 1 n'atteint personne — comportement inchangé.
 *
 * ─── L'enrobage est PAR AUDIENCE (#17086) ────────────────────────────────────
 *
 * L'étape 1 et chaque groupe de l'étape 2 sont INDÉPENDANTS : aucun ne dépend
 * du succès d'un autre, et ils portent des charges DIFFÉRENTES (une copie
 * élaguée par jeu de langues). Mesuré sur le paquet installé (socket.io 4.8.4) :
 * `emit` lève synchronement et PAR CHARGE — une charge non sérialisable lève et
 * l'émission suivante d'une charge saine passe. Un enrobage unique les perdait
 * donc ensemble, et c'est le cas nominal d'un encodeur en défaut, pas une
 * hypothèse de confort.
 */
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

import { filterMessagePayloadForLanguages, groupSocketsByLanguage } from './utils/message-payload-filter';
import { safeBroadcast } from './serverEmit';
import { enhancedLogger } from '../utils/logger-enhanced';

import type { ServerEventPayload } from './serverEmit';

const logger = enhancedLogger.child({ module: 'MessageNewByLanguage' });

type MessageNewPayload = ServerEventPayload<typeof SERVER_EVENTS.MESSAGE_NEW>;

type ByLanguageTarget = {
  emit(...args: [typeof SERVER_EVENTS.MESSAGE_NEW, MessageNewPayload]): unknown;
};
type ByLanguageOperator = ByLanguageTarget & {
  to(room: string): ByLanguageOperator;
  except(rooms: string | string[]): ByLanguageOperator;
};

/**
 * La porte d'émission ÉLARGIE à la lecture des sockets d'une room — la seule
 * chose que cette unité lit de socket.io au-delà de l'émission. Dérivée du
 * contrat comme `ServerEmitIO`, jamais le `Server` nu : ce que le compilateur
 * laisse passer part sur le fil, une diffusion n'ayant aucun sérialiseur.
 */
export type MessageNewByLanguageIO = {
  to(room: string): ByLanguageOperator;
  readonly sockets: {
    readonly adapter: { readonly rooms: { get(room: string): ReadonlySet<string> | undefined } };
  };
};

export type MessageNewByLanguageInput<P extends MessageNewPayload> = {
  readonly io: MessageNewByLanguageIO;
  /** `ROOMS.conversation(id)`. */
  readonly room: string;
  readonly payload: P;
  /**
   * L'expéditeur, retiré de l'élagage : ses appareils reçoivent la charge
   * cid-aware par une émission séparée, et une copie élaguée ici lui en ferait
   * recevoir DEUX. Par `userId` pour un inscrit, par `socketId` pour un anonyme.
   */
  readonly exclusion: { readonly excludeUserId?: string; readonly excludeSocketId?: string };
  readonly socketToUser: (socketId: string) => string | undefined;
  readonly resolveLanguages: (userId: string) => readonly string[] | undefined;
  readonly userLanguage: (userId: string) => string | undefined;
  /**
   * La panne d'UNE audience, nommée chez l'appelant ; sinon journalisée ici.
   * Le second paramètre est l'étiquette de l'audience perdue : sans elle,
   * « nommée » est un mot (constat C1 de l'audit de #17086).
   */
  readonly onEmissionError?: (error: unknown, label: string) => void;
};

export function emitMessageNewByLanguage<P extends MessageNewPayload>(input: MessageNewByLanguageInput<P>): void {
  const { io, room, payload, exclusion } = input;
  const onError = input.onEmissionError;
  const localSocketIds = io.sockets.adapter.rooms.get(room);

  const exceptForRemote: string[] = localSocketIds ? [...localSocketIds] : [];
  if (exclusion.excludeUserId) exceptForRemote.push(ROOMS.user(exclusion.excludeUserId));
  if (exclusion.excludeSocketId) exceptForRemote.push(exclusion.excludeSocketId);
  safeBroadcast(
    `message:new (langue · nœuds distants ${room})`,
    () => io.to(room).except(exceptForRemote).emit(SERVER_EVENTS.MESSAGE_NEW, payload),
    onError,
  );

  if (!localSocketIds || localSocketIds.size === 0) return;

  const originalLanguage = payload.originalLanguage || 'fr';
  const groups = groupSocketsByLanguage({
    socketIds: localSocketIds,
    originalLanguage,
    excludeUserId: exclusion.excludeUserId,
    excludeSocketIds: exclusion.excludeSocketId ? new Set([exclusion.excludeSocketId]) : undefined,
    socketToUser: input.socketToUser,
    resolveLanguages: input.resolveLanguages,
    userLanguage: input.userLanguage,
  });

  for (const group of groups) {
    // `groupSocketsByLanguage` ne crée un groupe qu'en y poussant un socket :
    // cette garde est donc INATTEIGNABLE aujourd'hui, et elle est reportée des
    // deux jumelles. Gardée — mais dite — parce qu'un groupe vide ferait
    // `io.to(undefined)` deux lignes plus bas, et que la non-vacuité est une
    // propriété du GROUPEUR, pas de ce site (constat C11 de l'audit).
    if (group.socketIds.length === 0) continue;
    // L'élagage est DANS la fermeture : il COMPOSE la charge de ce groupe, et
    // une composition qui lève pour un jeu de langues privait tous les groupes
    // suivants.
    safeBroadcast(
      `message:new (langue ${group.languages.join(',')} · ${group.socketIds.length} socket(s))`,
      () => {
        const filtered = filterMessagePayloadForLanguages(payload, group.languages);
        measureFilterGain(payload, filtered, group.languages, originalLanguage);
        const [firstSid, ...restSids] = group.socketIds;
        let emitter = io.to(firstSid as string);
        for (const sid of restSids) emitter = emitter.to(sid);
        emitter.emit(SERVER_EVENTS.MESSAGE_NEW, filtered);
      },
      onError,
    );
  }
}

/**
 * La mesure du gain de bande passante (#5.3) — debug, GATÉE : elle sert à
 * prouver la réduction en staging avant un passage en production, et son coût
 * est nul quand le drapeau est OFF.
 *
 * Ce qu'elle coûte quand il est ON, et c'est écrit parce que l'extraction l'a
 * étendu au producteur REST/ZMQ (constat C9) : DEUX sérialisations complètes de
 * la charge par groupe de langue et par message. Le drapeau est le seul gate —
 * `enhancedLogger.child()` n'expose pas `isLevelEnabled`, donc ce module ne
 * peut pas savoir si la ligne `debug` sera retenue, et les deux chaînes sont
 * construites avant de l'appeler. Sous `SOCKET_LANG_FILTER=true` AVEC un niveau
 * de log au-dessus de `debug`, le calcul est donc pure perte.
 *
 * Arbitrage assumé : le drapeau n'existe QUE pour cette mesure, l'allumer sans
 * vouloir la lire est une mauvaise configuration, et le vrai correctif — exposer
 * `isLevelEnabled` sur le logger enfant pour que tout appelant puisse surseoir
 * à un calcul de journal — n'appartient pas à ce module. Il a son issue : #17136.
 */
function measureFilterGain(payload: object, filtered: object, languages: readonly string[], originalLanguage: string): void {
  if (process.env.SOCKET_LANG_FILTER !== 'true') return;
  const fullBytes = JSON.stringify(payload).length;
  const filteredBytes = JSON.stringify(filtered).length;
  logger.debug('[lang-filter] payload reduced', {
    fullBytes,
    filteredBytes,
    savedPct: fullBytes > 0 ? Math.round((1 - filteredBytes / fullBytes) * 100) : 0,
    languages,
    originalLanguage,
  });
}
