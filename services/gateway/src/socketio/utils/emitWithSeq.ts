import type { Server } from 'socket.io';
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
 * Contrat : n'enrichit QUE les émissions vers UN destinataire (room = userId),
 * car `_seq` est per-user (`SequenceService.nextSeq(userId)`). Les broadcasts
 * room multi-destinataires (`message:new`) exigent un fan-out per-user distinct
 * → A2.2.
 *
 * Ordering garanti : `nextSeq(userId)` alloue atomiquement au niveau DB, mais
 * l'`await` sépare l'allocation de l'`emit`. Sans sérialisation, deux appels
 * concurrents pour le MÊME user peuvent voir leurs round-trips DB se résoudre
 * dans le désordre → `_seq=6` émis avant `_seq=5`, ce qui fait avancer le
 * `lastSeq` client à 6 puis droppe 5 comme périmé (ou fabrique un faux gap au
 * reconnect) — exactement le bug que `_seq` existe pour éliminer. On chaîne
 * donc allocation+emit sur une promesse per-user : deux émissions vers le même
 * user s'exécutent strictement en série (ordre d'allocation == ordre d'emit),
 * tandis que des users distincts restent concurrents (chaînes indépendantes).
 *
 * Backward-compat : le champ `_seq` est purement additif ; un client qui ne le
 * décode pas l'ignore. Si l'allocation de séquence échoue, l'event est émis
 * SANS `_seq` (jamais bloqué) — l'invariant « emit() n'await pas / ne throw pas
 * dans le chemin temps réel » prime, et le client retombe sur le gap recovery
 * temporel.
 */
const emitChains = new Map<string, Promise<void>>();

export async function emitWithSeq(
  io: Server,
  sequenceService: SequenceService,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Chaîne per-user : le maillon courant attend le précédent avant d'allouer
  // et d'émettre, garantissant ordre d'allocation == ordre d'emit. Le `.catch`
  // isole les maillons — un échec précédent ne doit jamais rompre la chaîne.
  const previous = emitChains.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    let seq: number | undefined;
    try {
      seq = await sequenceService.nextSeq(userId);
    } catch {
      seq = undefined;
    }
    const enriched = seq === undefined ? payload : { ...payload, _seq: seq };
    io.to(userId).emit(event, enriched);
  });

  emitChains.set(userId, next);
  // Évite la croissance non bornée de la Map : on retire l'entrée une fois le
  // maillon résolu, sauf si un maillon plus récent a déjà pris sa place. Ce
  // branchement est distinct de `next` (retourné à l'appelant) — son `.catch`
  // évite une unhandled rejection quand l'emit du maillon échoue.
  void next
    .finally(() => {
      if (emitChains.get(userId) === next) emitChains.delete(userId);
    })
    .catch(() => {});

  return next;
}
