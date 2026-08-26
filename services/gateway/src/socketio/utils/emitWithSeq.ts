import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { SequenceService } from '../../services/SequenceService';
import {
  emitServerEvent,
  type ServerEmitIO,
  type ServerEventName,
  type ServerEventPayload,
} from '../serverEmit';

/**
 * SyncEngine unifié (spec §5+§7.5, sous-tâche A2) — émission Socket.IO
 * USER-SCOPED enrichie d'un numéro de séquence monotone `_seq`.
 *
 * Le client applique l'event en temps réel ET avance son `lastSeq` ; au
 * reconnect, comparer son dernier `lastSeq` à `checkpointSeq` (renvoyé par
 * `/sync`, A3) donne une détection de gap EXACTE (« vu 91230, serveur à
 * 91234 → 4 events manqués ») — supérieure au gap recovery temporel actuel,
 * notamment pour l'ordering multi-device.
 *
 * Contrat : n'enrichit QUE les émissions vers UN destinataire (room =
 * `ROOMS.user(userId)`), car `_seq` est per-user (`SequenceService.nextSeq(userId)`).
 * Les registered sockets ne joignent QUE `ROOMS.user(id)` (= `user:${id}`, voir
 * `AuthHandler._authenticateJWTUser`) — émettre vers le room brut `userId` ciblerait
 * un room vide et l'event temps réel serait perdu. Les broadcasts room
 * multi-destinataires (`message:new`) exigent un fan-out per-user distinct → A2.2.
 *
 * Backward-compat : le champ `_seq` est purement additif ; un client qui ne le
 * décode pas l'ignore. Si l'allocation de séquence échoue, l'event est émis
 * SANS `_seq` (jamais bloqué) — l'invariant « emit() n'await pas / ne throw pas
 * dans le chemin temps réel » prime, et le client retombe sur le gap recovery
 * temporel.
 *
 * LOCKSTEP avec les clients : le `_seq` est per-user GLOBAL, pas per-event. Un
 * client qui n'observe qu'un SOUS-ENSEMBLE des events estampillés voit un trou
 * à chaque event non observé. Étendre la liste des appelants ci-dessous oblige
 * donc à étendre l'observation dans le MÊME train de release, sur les TROIS
 * clients qui la portent : iOS (`SyncSeqTracker.observe`, MessageSocketManager),
 * web (`observeSyncSeq`, `notification-socketio.singleton`) et Android
 * (`SyncSeqTracker.observe`, `sdk-core/.../socket/MessageSocketManager.kt` —
 * câblé au cycle 108 ; avant ça Android jetait le champ et n'avait AUCUNE
 * détection de trou exacte, pendant que le contrat partagé affirmait le
 * contraire).
 *
 * Ordering (SyncEngine A2, fix ordering) : `nextSeq` renvoie des valeurs
 * distinctes et strictement croissantes DANS L'ORDRE D'APPEL, mais deux appels
 * concurrents pour le même user s'exécutent sur des connexions Mongo poolées
 * différentes dont les réponses peuvent revenir DANS LE DÉSORDRE — le `await`
 * de `_seq=N+1` peut résoudre avant celui de `_seq=N`, émettant l'event le plus
 * récent en premier. Le client avance alors `lastSeq` à `N+1` et rejette le
 * `_seq=N` reçu ensuite comme doublon périmé (perte de l'event temps réel,
 * récupéré seulement au prochain `/sync`). Pour garantir « ordre d'émission ==
 * ordre d'allocation », l'allocation ET l'emit sont sérialisés PAR USER via une
 * chaîne de promesses en mémoire : un appel n'alloue son `_seq` qu'une fois le
 * précédent (même user) émis. Les users distincts gardent des chaînes séparées
 * (aucun head-of-line blocking cross-user).
 *
 * Liveness (borne d'allocation) : `nextSeq` est un upsert MongoDB. Un rejet est
 * déjà toléré (émission SANS `_seq`), mais un STALL — connexion poolée bloquée,
 * élection du replica set — ne rejette pas : il pend. Comme l'allocation est
 * sérialisée par user, un seul stall bloquerait TOUS les events temps réel de ce
 * user, en contradiction directe avec l'invariant « le chemin temps réel n'est
 * jamais bloqué ». L'allocation est donc bornée par `timeoutMs` (défaut
 * `DEFAULT_SEQ_TIMEOUT_MS`) : au-delà, on dégrade exactement comme un rejet
 * (émission SANS `_seq`, gap récupéré au prochain `/sync`) et la chaîne avance.
 * Le fast path (`nextSeq` rapide) garde l'ordering strict et ne paie aucun coût.
 */
const userEmitChains = new Map<string, Promise<void>>();

export const DEFAULT_SEQ_TIMEOUT_MS = 2000;

export function emitWithSeq<E extends ServerEventName>(
  io: ServerEmitIO,
  sequenceService: SequenceService,
  userId: string,
  event: E,
  payload: ServerEventPayload<E>,
  timeoutMs: number = DEFAULT_SEQ_TIMEOUT_MS,
): Promise<void> {
  const previous = userEmitChains.get(userId) ?? Promise.resolve();
  const next = previous
    // Un échec de l'emit précédent ne doit jamais casser la chaîne du user.
    .then(
      () => emitEnriched(io, sequenceService, userId, event, payload, timeoutMs),
      () => emitEnriched(io, sequenceService, userId, event, payload, timeoutMs),
    );
  userEmitChains.set(userId, next);
  // Éviter la croissance non bornée de la Map : on retire la queue une fois
  // drainée, sauf si un appel plus récent l'a déjà remplacée.
  //
  // Le `.catch` final n'est PAS décoratif. `.finally` ADOPTE le sort de `next` :
  // la promesse qu'il rend rejette quand `next` rejette, et cette promesse-ci
  // est DÉTACHÉE par le `void`. Un appelant qui garde consciencieusement le
  // `next` qu'on lui rend ne couvre donc pas cette branche dérivée — elle
  // rejette sans écouteur, ce que Node compte comme `unhandledRejection`
  // (CLAUDE.md § « `void p` exige TOUJOURS `p.catch(...)` », Leçon 230). La
  // cause est réelle et pas hypothétique : `emitEnriched` finit par
  // `io.to(...).emit(...)`, qui lève quand l'adaptateur ou l'encodeur est en
  // défaut. Le nettoyage de la Map est le SEUL travail dû ici ; l'erreur, elle,
  // appartient à l'appelant, qui la reçoit par le `next` rendu.
  void next
    .finally(() => {
      if (userEmitChains.get(userId) === next) {
        userEmitChains.delete(userId);
      }
    })
    .catch(() => { /* le rejet est celui de `next` — déjà rendu à l'appelant */ });
  return next;
}

async function emitEnriched<E extends ServerEventName>(
  io: ServerEmitIO,
  sequenceService: SequenceService,
  userId: string,
  event: E,
  payload: ServerEventPayload<E>,
  timeoutMs: number,
): Promise<void> {
  const seq = await allocateSeq(sequenceService, userId, timeoutMs);
  // `_seq` est DÉCLARÉ au contrat depuis le cycle 105 : l'enrichissement rend
  // donc `ServerEventPayload<E> & { _seq: number }`, assignable à
  // `ServerEventPayload<E>` sans aucune assertion. Tant que ce paramètre valait
  // `Record<string, unknown>`, le champ voyageait chez les trois clients sans
  // qu'aucun contrat n'en parle.
  const enriched = seq === undefined ? payload : { ...payload, _seq: seq };
  emitServerEvent(io.to(ROOMS.user(userId)), event, enriched);
}

/**
 * Alloue un `_seq` en bornant l'attente : rejet OU stall au-delà de `timeoutMs`
 * dégrade en `undefined` (émission sans `_seq`). Le rejet du `nextSeq` perdant
 * est absorbé (`.catch`) pour ne pas produire d'unhandled rejection, et le timer
 * est nettoyé sur le fast path (aucune fuite, aucun handle qui garde le process
 * en vie).
 */
async function allocateSeq(
  sequenceService: SequenceService,
  userId: string,
  timeoutMs: number,
): Promise<number | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onTimeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
  try {
    return await Promise.race([
      sequenceService.nextSeq(userId).catch(() => undefined),
      onTimeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
