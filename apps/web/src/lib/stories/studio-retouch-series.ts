import type { PendingAttachment } from '@/lib/send/attachments';

/**
 * **« ÉDITER » UNE PIÈCE EN ATTENTE OUVRE TOUTES LES PIÈCES DU MESSAGE** (#9126,
 * miroir `ComposerRetouchSeries.swift`) — une scène par image ou vidéo, dans
 * l'ordre du plateau, ouvertes sur la pièce touchée. Un son n'a pas de scène :
 * il garde son lecteur.
 */
export type RetouchSeries = {
  readonly pieces: readonly PendingAttachment[];
  /** L'index, dans `pieces`, de la pièce touchée. */
  readonly focus: number;
};

/** Le plafond de scènes du studio (`STUDIO_PAGE_MAX`), recopié pour que le
 * plateau du fil n'embarque pas le module du studio — un témoin les tient égaux. */
export const RETOUCH_SCENE_CAP = 10;

/** La fenêtre de pièces montées quand le message en porte plus que le studio
 * n'a de scènes — elle contient TOUJOURS la pièce touchée. */
export function retouchSeriesWindow(count: number, focus: number, cap = RETOUCH_SCENE_CAP): { readonly start: number; readonly end: number } {
  if (count <= cap) return { start: 0, end: Math.max(count, 0) };
  const start = Math.min(Math.max(focus - Math.floor(cap / 2), 0), count - cap);
  return { start, end: start + cap };
}

export function retouchSeriesOf(pending: readonly PendingAttachment[], focusLocalId: string): RetouchSeries | null {
  const candidates = pending.filter((attachment) => attachment.kind === 'image' || attachment.kind === 'video');
  const touched = candidates.findIndex((attachment) => attachment.localId === focusLocalId);
  if (touched < 0) return null;
  const { start, end } = retouchSeriesWindow(candidates.length, touched);
  return { pieces: candidates.slice(start, end), focus: touched - start };
}
