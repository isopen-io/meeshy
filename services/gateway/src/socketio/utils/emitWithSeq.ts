import type { Server } from 'socket.io';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { SequenceService } from '../../services/SequenceService';

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
 */
const userEmitChains = new Map<string, Promise<void>>();

export function emitWithSeq(
  io: Server,
  sequenceService: SequenceService,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const previous = userEmitChains.get(userId) ?? Promise.resolve();
  const next = previous
    // Un échec de l'emit précédent ne doit jamais casser la chaîne du user.
    .then(
      () => emitEnriched(io, sequenceService, userId, event, payload),
      () => emitEnriched(io, sequenceService, userId, event, payload),
    );
  userEmitChains.set(userId, next);
  // Éviter la croissance non bornée de la Map : on retire la queue une fois
  // drainée, sauf si un appel plus récent l'a déjà remplacée.
  void next.finally(() => {
    if (userEmitChains.get(userId) === next) {
      userEmitChains.delete(userId);
    }
  });
  return next;
}

async function emitEnriched(
  io: Server,
  sequenceService: SequenceService,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  let seq: number | undefined;
  try {
    seq = await sequenceService.nextSeq(userId);
  } catch {
    seq = undefined;
  }
  const enriched = seq === undefined ? payload : { ...payload, _seq: seq };
  io.to(ROOMS.user(userId)).emit(event, enriched);
}
