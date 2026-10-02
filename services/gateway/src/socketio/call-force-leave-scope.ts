/**
 * **`call:force-leave` NE TOUCHE PLUS UN APPEL VIVANT** (#9111).
 *
 * Le verbe existe pour débloquer un `CALL_ALREADY_ACTIVE` laissé par un appel
 * fantôme (plantage avant l'écriture de `leftAt`). Les clients l'émettent
 * avant chaque `call:initiate` — y compris le participant coupé qui revient
 * dans la conversation et touche « Appeler » pendant sa fenêtre de grâce : sa
 * ligne était encore vivante, le verbe la quittait, et un DUO se terminait
 * pour l'autre au moment même où l'on revenait.
 *
 * Un appel DÉCROCHÉ qui garde un autre participant actif n'est pas un
 * fantôme : il est épargné, et le refus `CALL_ALREADY_ACTIVE` qui suit porte
 * son identifiant (`activeCallId`) pour que le client le rejoigne. Un appel
 * jamais décroché, ou où l'on est seul, reste nettoyé comme avant.
 */

type ForceLeaveRow = {
  readonly leftAt?: Date | null;
  readonly participantId: string;
  readonly participant?: { readonly userId?: string | null } | null;
};

export type ForceLeaveCandidate = {
  readonly answeredAt?: Date | null;
  readonly participants: readonly ForceLeaveRow[];
};

export function forceLeaveSparesLiveCall(call: ForceLeaveCandidate, userId: string): boolean {
  if (!call.answeredAt) return false;
  return call.participants.some((row) => !row.leftAt && (row.participant?.userId ?? row.participantId) !== userId);
}
