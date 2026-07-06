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
 * `ROOMS.user(userId)` = `user:${userId}`, la room que les sockets d'un
 * utilisateur enregistré rejoignent à l'auth — cf. AuthHandler), car `_seq`
 * est per-user (`SequenceService.nextSeq(userId)`). Les broadcasts
 * room multi-destinataires (`message:new`) exigent un fan-out per-user distinct
 * → A2.2.
 *
 * Backward-compat : le champ `_seq` est purement additif ; un client qui ne le
 * décode pas l'ignore. Si l'allocation de séquence échoue, l'event est émis
 * SANS `_seq` (jamais bloqué) — l'invariant « emit() n'await pas / ne throw pas
 * dans le chemin temps réel » prime, et le client retombe sur le gap recovery
 * temporel.
 */
export async function emitWithSeq(
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
