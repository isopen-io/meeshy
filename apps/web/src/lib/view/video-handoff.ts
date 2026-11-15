/**
 * LA POSITION D'UNE VIDÉO PASSÉE AU PLEIN ÉCRAN (#8234, miroir de la reprise
 * du moteur partagé iOS — `SharedAVPlayerManager`, #8231). La tuile du fil
 * lit dans son propre `<video>` et la visionneuse dans le sien : rien ne les
 * relie, donc toucher une vidéo EN COURS de lecture relançait le plein écran
 * depuis la position SERVIE (ou zéro), pas depuis l'image qu'on regardait.
 *
 * La tuile CONFIE sa position au moment où elle ouvre la visionneuse ; la page
 * vidéo la REPREND une fois, à son montage — un relais à usage unique, jamais
 * un état : une seconde ouverture de la même pièce, sans lecture entre les
 * deux, repart de la reprise servie.
 */
const handoffs = new Map<string, number>();

export function handOffVideoPosition({ attachmentId, positionMs }: { readonly attachmentId: string; readonly positionMs: number }): void {
  if (!Number.isFinite(positionMs) || positionMs < 0) return;
  handoffs.set(attachmentId, positionMs);
}

export function takeVideoHandoff(attachmentId: string): number | null {
  const positionMs = handoffs.get(attachmentId);
  handoffs.delete(attachmentId);
  return positionMs ?? null;
}
