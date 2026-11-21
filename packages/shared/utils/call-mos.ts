/**
 * **Le MOS d'un appel** (#19876) : l'E-model simplifié de l'UIT-T G.107, porté
 * à l'identique de `CallMOS.estimate` (MeeshySDK, #11294) pour qu'un même lien
 * rende la même note sur iOS et sur le web, ramené de R (0–100) à une note de
 * 1 à 4,5.
 *
 * - délai en bouche-à-oreille : la moitié de l'aller-retour, deux fois la
 *   gigue, et le délai du codec ;
 * - dégradation par le délai : faible sous 160 ms, forte au-delà ;
 * - dégradation par la perte : `95 · P / (P + Bpl)`, Opus masquant les pertes.
 *
 * Loi pure, sans état : chaque client l'applique à ses moyennes d'appel.
 */

export const CALL_MOS_CODEC_DELAY_MS = 10;
export const CALL_MOS_LOSS_ROBUSTNESS = 10;
export const CALL_MOS_CEILING = 4.5;

export type CallMosInput = {
  readonly roundTripTimeMs: number;
  readonly jitterMs: number;
  readonly packetLossPercent: number;
};

const finite = (value: number): number => (Number.isFinite(value) ? Math.max(value, 0) : 0);

export function estimateCallMos({ roundTripTimeMs, jitterMs, packetLossPercent }: CallMosInput): number {
  const delai = finite(roundTripTimeMs) / 2 + 2 * finite(jitterMs) + CALL_MOS_CODEC_DELAY_MS;
  const parDelai = delai < 160 ? delai / 40 : (delai - 120) / 10;
  const perte = Math.min(finite(packetLossPercent), 100);
  const parPerte = (95 * perte) / (perte + CALL_MOS_LOSS_ROBUSTNESS);
  const r = Math.min(Math.max(93.2 - parDelai - parPerte, 0), 100);
  const mos = 1 + 0.035 * r + 0.000007 * r * (r - 60) * (100 - r);
  return Math.min(Math.max(mos, 1), CALL_MOS_CEILING);
}
