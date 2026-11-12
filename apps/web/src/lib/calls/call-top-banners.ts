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

/** Les bandeaux qui couvrent le coin de ma vignette : MON partage (pleine largeur), l'enregistrement (carte, capsule ou avis) et la capture (R1.6, R3.10). Le cadre ne la déplace pas, comme sur iOS (`CallTopBannerStack.selfTileClearance`) et Android (`selfTileClearanceDp`) ; un partage REÇU n'est pas dans la pile (#17730). */
const SELF_TILE_BANNERS: ReadonlySet<TopBanner> = new Set(['screen-share', 'recording', 'capture']);

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
