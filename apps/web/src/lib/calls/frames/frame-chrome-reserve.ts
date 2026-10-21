/**
 * **LES BANDES QUE DES CONTRÔLES COUVRENT** (#10481, miroir de
 * `CallFrameChromeReserve`, iOS #9777) — en part de la hauteur de la toile,
 * en haut et en bas. Un texte du cadre (titre, sous-titre, signature, noms)
 * ne s'y pose jamais : les réserves de texte descendent sous la bande haute et
 * remontent au-dessus de la bande basse, la zone des visages se resserre entre
 * elles. Le fond et la bordure restent bord à bord. `NO_CHROME_RESERVE` ⇒ la
 * géométrie canonique (fixture de parité web ↔ iOS).
 *
 * Ne vit que dans l'atelier des cadres (`call_frame_studio`) : le mode
 * Montage ne lui remet que ses mesures d'écran (`FrameChrome`, un type).
 */

export type FrameChromeReserve = { readonly top: number; readonly bottom: number };

/** Les contrôles mesurés sur l'écran : sa taille, et les hauteurs en pixels CSS qu'ils couvrent depuis le haut et depuis le bas. */
export type FrameChrome = { readonly viewport: { readonly width: number; readonly height: number }; readonly top: number; readonly bottom: number };

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export const NO_CHROME_RESERVE: FrameChromeReserve = { top: 0, bottom: 0 };

/** Une bande ne dépasse jamais la moitié de la toile ; au millième SUPÉRIEUR, pour qu'une mesure voisine ne repeigne pas le cadre et que l'arrondi ne rende jamais une bande plus courte que le contrôle. */
const share = (value: number): number => (Number.isFinite(value) && value > 0 ? Math.min(0.5, Math.ceil(value * 1000) / 1000) : 0);

export const chromeReserve = (top: number, bottom: number): FrameChromeReserve => ({ top: share(top), bottom: share(bottom) });

export const isNoChromeReserve = (reserve: FrameChromeReserve): boolean => reserve.top === 0 && reserve.bottom === 0;

/** Les bandes de contrôles mesurées en pixels sur une toile de `height` pixels. */
export const chromeReserveCovering = ({ top, bottom, height }: { readonly top: number; readonly bottom: number; readonly height: number }): FrameChromeReserve =>
  height > 0 ? chromeReserve(top / height, bottom / height) : NO_CHROME_RESERVE;

/** Les deux bandes dans une toile de `size`. */
export function chromeBands(reserve: FrameChromeReserve, size: { readonly width: number; readonly height: number }): { readonly top: Box; readonly bottom: Box } {
  const topHeight = reserve.top * size.height;
  const bottomHeight = reserve.bottom * size.height;
  return {
    top: { x: 0, y: 0, width: size.width, height: topHeight },
    bottom: { x: 0, y: size.height - bottomHeight, width: size.width, height: bottomHeight },
  };
}

/**
 * **LES CONTRÔLES DE L'ÉCRAN, RAPPORTÉS À LA TOILE QUI S'Y AFFICHE** — la
 * toile du cadre est posée `object-contain` au centre de l'écran (`viewport`)
 * : la part d'une bande qui tombe dans le bandeau noir ne prend rien au cadre.
 * `top` et `bottom` sont les hauteurs, en pixels CSS, que les contrôles
 * couvrent depuis le haut et depuis le bas de l'écran.
 */
export function chromeReserveOnScreen({ viewport, canvas, top, bottom }: { readonly viewport: { readonly width: number; readonly height: number }; readonly canvas: { readonly width: number; readonly height: number }; readonly top: number; readonly bottom: number }): FrameChromeReserve {
  if (viewport.width <= 0 || viewport.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return NO_CHROME_RESERVE;
  const shown = canvas.height * Math.min(viewport.width / canvas.width, viewport.height / canvas.height);
  const letterbox = (viewport.height - shown) / 2;
  return chromeReserveCovering({ top: top - letterbox, bottom: bottom - letterbox, height: shown });
}
