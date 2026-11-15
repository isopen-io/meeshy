/**
 * `readDevice` — l'appareil sur lequel un membre a lu — ne concerne que LUI
 * (#7358). Les portes nominatives « qui a lu » le servaient pour chaque ligne,
 * à tout membre qui les ouvrait. Une seule règle, pour toutes les portes :
 * la ligne du lecteur garde son appareil, les autres le perdent. Sans lecteur
 * identifié, personne ne le garde.
 */
export function readDeviceServedTo(
  row: { readonly participantId: string; readonly readDevice?: string | null },
  viewerParticipantId: string | null
): string | null {
  return viewerParticipantId !== null && row.participantId === viewerParticipantId
    ? row.readDevice ?? null
    : null;
}
