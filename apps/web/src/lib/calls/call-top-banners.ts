/**
 * **LA PILE DES BANDEAUX DU HAUT** (P16.7, #17746 ; `CallTopBannerStack.ordered` d'iOS) — le partage
 * d'écran, l'enregistrement, la capture, les pastilles de service (« En attente », « Vidéo réduite »,
 * #18227, rang d'Android `CallTopBanner.Hold` / `VideoNotice`) et le cadre en direct forment UNE pile
 * sous l'en-tête, dans un ordre fixe quel que soit l'ordre d'arrivée. Une loi pure : l'écran pose,
 * l'indicateur d'enregistrement et ma vignette lisent d'elle la place qu'il leur reste.
 */
export type TopBanner = 'screen-share' | 'recording' | 'capture' | 'hold' | 'video-notice' | 'live-frame';

export type PresentBanners = Readonly<Partial<Record<TopBanner, boolean>>>;

const ORDER: readonly TopBanner[] = ['screen-share', 'recording', 'capture', 'hold', 'video-notice', 'live-frame'];

/** La hauteur que chaque bandeau prend dans la pile, écart compris (px) — le cadre en direct, de hauteur variable, ne réserve rien à ma vignette. */
export const TOP_BANNER_CLEARANCE: Readonly<Record<TopBanner, number>> = { 'screen-share': 60, recording: 60, capture: 56, hold: 52, 'video-notice': 52, 'live-frame': 0 };

export const orderedTopBanners = (present: PresentBanners): readonly TopBanner[] => ORDER.filter((banner) => present[banner] === true);

/** Les bandeaux qui couvrent le coin de ma vignette : MON partage (pleine largeur), l'enregistrement (carte, capsule ou avis), la capture (R1.6, R3.10) et les pastilles de service (E3 · E4, #18227 : jamais couverte). Le cadre ne la déplace pas, comme sur iOS (`CallTopBannerStack.selfTileClearance`) et Android (`selfTileClearanceDp`) ; un partage REÇU n'est pas dans la pile (#17730). */
const SELF_TILE_BANNERS: ReadonlySet<TopBanner> = new Set(['screen-share', 'recording', 'capture', 'hold', 'video-notice']);

/** Ce que ma vignette et ses commandes descendent sous l'en-tête : la carte d'accord y compte sa hauteur MESURÉE (`recordingCard`, 0 sans carte), écart compris. */
export const selfTileClearance = (present: PresentBanners, recordingCard = 0): number =>
  orderedTopBanners(present)
    .filter((banner) => SELF_TILE_BANNERS.has(banner))
    .reduce((sum, banner) => sum + (banner === 'recording' ? recordingClearance(recordingCard) : TOP_BANNER_CLEARANCE[banner]), 0);

/** Ce qui est posé AVANT `banner` dans la pile : de combien il descend sous l'en-tête. */
export const topBannersAbove = (banner: TopBanner, present: PresentBanners): number =>
  orderedTopBanners(present)
    .filter((other) => ORDER.indexOf(other) < ORDER.indexOf(banner))
    .reduce((sum, other) => sum + TOP_BANNER_CLEARANCE[other], 0);

type RecordingBannerState = { readonly view: { readonly kind: 'idle' | 'pending' | 'recording' | 'asking'; readonly mustAnswer?: boolean }; readonly notice: unknown };

/**
 * La case de l'enregistrement est tenue dès qu'il y a QUELQUE CHOSE à dire : la carte d'accord, la capsule
 * (attente ou enregistrement) ou son avis (`CallRecordingBannerStage` d'iOS : consentement, statut et avis
 * sont le MÊME bandeau `.recording` de la pile). La carte n'y flotte plus : la capture et le cadre en direct
 * sont repoussés sous elle (R2.1).
 */
export const recordingBannerPresent = ({ view, notice }: RecordingBannerState): boolean => view.kind !== 'idle' || notice !== null;

/** Le plancher de la case (px) : une capsule et l'écart qui la sépare du bandeau suivant. */
export const RECORDING_SLOT_MIN = TOP_BANNER_CLEARANCE.recording - 8;

/** La hauteur de la case : celle de la carte d'accord MESURÉE quand elle y est (`CallTopBannerStack.selfTileClearance` d'iOS compte la hauteur mesurée de chaque bandeau, jamais moins que le plancher). */
export const recordingSlotHeight = (card: number): number => Math.max(RECORDING_SLOT_MIN, card);

/** La case de l'enregistrement et l'écart qui la sépare de ce qui suit : ce que ma vignette descend sous elle. */
function recordingClearance(card: number): number {
  return recordingSlotHeight(card) + TOP_BANNER_CLEARANCE.recording - RECORDING_SLOT_MIN;
}

/** La marge que chaque bandeau garde de chaque bord (`px-3`), et l'écart entre la pile et ma vignette. */
export const TOP_BANNER_MARGIN = 12;

const TOP_BANNER_GAP = 8;

/** #17965 · #17935 — la borne de toute pilule sur fenêtre large, que la pile prend en paysage. */
export const TOP_BANNER_LANDSCAPE_MAX = 560;

/** Le plus étroit où « Vous partagez votre écran · Arrêter » tient encore sur une ligne. */
export const TOP_BANNER_LANDSCAPE_MIN = 300;

/** Ma vignette vue de la pile : sa largeur et sa distance au bord, rail compris quand elle lui cède le coin (L2.8). */
export type TopBannerNeighbor = { readonly width: number; readonly edgeDistance: number };

/** `bannerMaxWidth` : `null` debout (toute la largeur, ma vignette dessous) ; couchée, la borne, et ma vignette gardée à côté ou non. */
export type TopBannerSpan = { readonly bannerMaxWidth: number | null; readonly keepsSelfTileBeside: boolean };

type SpanInput = {
  readonly window: { readonly width: number; readonly height: number };
  readonly safeHorizontal: number;
  readonly selfTile: TopBannerNeighbor | null;
  /** Ce qui doit tenir à côté de ma vignette — la carte d'accord, qui flotte hors de la pile sur le web, y est plus large qu'un bandeau. */
  readonly minimumWidth?: number;
};

/**
 * **L1.8 (#17965 point 2, L6) — EN PAYSAGE, LA PILE SE BORNE À 560 ET SE CENTRE** ; elle se resserre pour laisser ma
 * vignette dans son coin, à côté d'elle, tant qu'elle reste lisible. Trop étroite, ma vignette descend sous elle, comme
 * debout. La forme de la fenêtre décide. Miroir d'iOS (`CallTopBannerStack.span`, #18247), mêmes vecteurs.
 */
export function topBannerSpan({ window, safeHorizontal, selfTile, minimumWidth = TOP_BANNER_LANDSCAPE_MIN }: SpanInput): TopBannerSpan {
  if (window.width <= window.height) return { bannerMaxWidth: null, keepsSelfTileBeside: false };
  const alone = Math.max(0, Math.min(TOP_BANNER_LANDSCAPE_MAX, window.width - 2 * (safeHorizontal + TOP_BANNER_MARGIN)));
  if (selfTile === null) return { bannerMaxWidth: alone, keepsSelfTileBeside: false };
  const beside = Math.min(alone, window.width - 2 * (selfTile.edgeDistance + selfTile.width + TOP_BANNER_GAP));
  return beside >= Math.max(TOP_BANNER_LANDSCAPE_MIN, minimumWidth) ? { bannerMaxWidth: beside, keepsSelfTileBeside: true } : { bannerMaxWidth: alone, keepsSelfTileBeside: false };
}

/** La largeur que prend chaque maillon de la pile, ses marges comprises — `null` : toute la largeur. */
export const topBannerStackMaxWidth = (span: TopBannerSpan): number | null => (span.bannerMaxWidth === null ? null : span.bannerMaxWidth + 2 * TOP_BANNER_MARGIN);

/**
 * **P11.1 — EN GROUPE, L'EN-TÊTE FLOTTE SUR LA GRILLE** (planche P11 ; `headerFloatsOverGroupStage` d'iOS #18395,
 * d'Android #18414). Pas en hauteur compacte (L4, #17885 : la rangée de quatre reste entre l'en-tête et la pilule), ni
 * sur la une (P14 : sa capsule et la puce d'écran se posent au haut de sa vignette, sous l'en-tête).
 */
export const headerFloatsOverGroupStage = ({ isGrid, isCompactHeight }: { readonly isGrid: boolean; readonly isCompactHeight: boolean }): boolean => isGrid && !isCompactHeight;

/** D'où part la scène de groupe : de la zone sûre (l'en-tête flotte, ou plein écran), ou sous l'en-tête et la pile — un bandeau présent garde la grille sous lui (L4.11). Miroir de `groupStageTopBase` d'iOS. */
export type GroupStageTop = 'safe-area' | 'under-header';

export const groupStageTop = ({ headerFloats, hasBanners, isStageFullScreen }: { readonly headerFloats: boolean; readonly hasBanners: boolean; readonly isStageFullScreen: boolean }): GroupStageTop =>
  isStageFullScreen || (headerFloats && !hasBanners) ? 'safe-area' : 'under-header';

/** La carte d'accord flotte hors de la pile sur le web (`call-recording-layer.tsx`, `max-w-md`) : ce qu'elle doit trouver à côté de ma vignette pour que celle-ci garde son coin. */
export const RECORDING_CARD_MAX_WIDTH = 448;

/** Ma vignette telle que la pile la voit : dans un coin du HAUT seulement, sa largeur et sa distance au bord physique de son coin. */
export const topBannerNeighborOf = (tile: { readonly corner: string; readonly x: number; readonly width: number } | null, windowWidth: number): TopBannerNeighbor | null =>
  tile === null || !tile.corner.startsWith('top') ? null : { width: tile.width, edgeDistance: tile.corner.endsWith('right') ? windowWidth - tile.x - tile.width : tile.x };
