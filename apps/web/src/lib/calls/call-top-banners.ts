/**
 * **LA PILE DES BANDEAUX DU HAUT** (P16.7, #17746 ; `CallTopBannerStack.ordered` d'iOS) — le partage
 * d'écran, l'enregistrement, la capture et le cadre en direct forment UNE pile sous l'en-tête, dans
 * un ordre fixe quel que soit l'ordre d'arrivée. Une loi pure : l'écran pose, l'indicateur
 * d'enregistrement et ma vignette lisent d'elle la place qu'il leur reste.
 */
export type TopBanner = 'screen-share' | 'recording' | 'capture' | 'live-frame';

export type PresentBanners = Readonly<Partial<Record<TopBanner, boolean>>>;

const ORDER: readonly TopBanner[] = ['screen-share', 'recording', 'capture', 'live-frame'];

/** La hauteur que chaque bandeau prend dans la pile, écart compris (px) — le cadre en direct, de hauteur variable, ne réserve rien à ma vignette. */
export const TOP_BANNER_CLEARANCE: Readonly<Record<TopBanner, number>> = { 'screen-share': 60, recording: 60, capture: 56, 'live-frame': 0 };

export const orderedTopBanners = (present: PresentBanners): readonly TopBanner[] => ORDER.filter((banner) => present[banner] === true);

/** Ce que les bandeaux posés prennent sous l'en-tête : ma vignette et ses commandes descendent d'autant. */
export const topBannersClearance = (present: PresentBanners): number => orderedTopBanners(present).reduce((sum, banner) => sum + TOP_BANNER_CLEARANCE[banner], 0);

/** Ce qui est posé AVANT `banner` dans la pile : de combien il descend sous l'en-tête. */
export const topBannersAbove = (banner: TopBanner, present: PresentBanners): number =>
  orderedTopBanners(present)
    .filter((other) => ORDER.indexOf(other) < ORDER.indexOf(banner))
    .reduce((sum, other) => sum + TOP_BANNER_CLEARANCE[other], 0);
