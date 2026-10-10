/**
 * **LES MENUS D'APPUI LONG DE LA SCÈNE** (#8715, jumelles de
 * `ComposerBackgroundMenuAction` et `ComposerSceneMenu` iOS, #8716 / #8717) :
 *
 * > « Le longpress sur un média au premier plan doit proposer de le mettre en
 * > fond ou de remplacer le fond. Le longpress sur la scène qui a déjà un fond
 * > doit proposer, en plus du menu actuel, l'option reprendre une photo pour
 * > lancer l'objectif et montrer l'objectif. »
 */

/** Ce que le menu du FOND sert, dans l'ordre d'iOS : modifier (le Cadre),
 * reprendre une photo, passer au premier plan, retirer. */
export type StudioBackgroundMenuAction = 'edit' | 'retake' | 'forward' | 'remove';

const SERVED: readonly StudioBackgroundMenuAction[] = ['edit', 'retake', 'forward', 'remove'];

/** Sans photo au viseur (un réel), « Reprendre une photo » n'aurait pas
 * d'effet ; un calque déjà posé ferme le premier plan (une scène n'en porte
 * qu'un) — loi 4. */
export function studioBackgroundMenuActions({ offersPhoto, overlayFree }: { readonly offersPhoto: boolean; readonly overlayFree: boolean }): readonly StudioBackgroundMenuAction[] {
  return SERVED.filter((action) => (action !== 'retake' || offersPhoto) && (action !== 'forward' || overlayFree));
}

/** Le verbe dit ce qui arrive au fond — posé, ou remplacé. */
export function studioOverlayBackgroundAction({ hasBackground }: { readonly hasBackground: boolean }): 'set-background' | 'replace-background' {
  return hasBackground ? 'replace-background' : 'set-background';
}

type Point = { readonly x: number; readonly y: number };
type Size = { readonly width: number; readonly height: number };

/** **Où le menu se pose** (`ComposerSceneMenu.frame`) : centré sur le doigt,
 * sous lui s'il tient, au-dessus sinon — et toujours DANS l'écran. */
export function studioMenuFrame({
  anchor,
  menu,
  container,
  margin,
}: {
  readonly anchor: Point;
  readonly menu: Size;
  readonly container: Size;
  readonly margin: number;
}): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const width = Math.min(menu.width, Math.max(0, container.width - 2 * margin));
  const height = Math.min(menu.height, Math.max(0, container.height - 2 * margin));
  const x = Math.min(Math.max(anchor.x - width / 2, margin), Math.max(margin, container.width - margin - width));
  const below = anchor.y + 12;
  const above = anchor.y - 12 - height;
  const y0 = below + height <= container.height - margin ? below : above;
  const y = Math.min(Math.max(y0, margin), Math.max(margin, container.height - margin - height));
  return { x, y, width, height };
}
