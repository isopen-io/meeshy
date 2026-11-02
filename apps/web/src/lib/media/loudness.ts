/**
 * **DEUX VOCAUX, UN MÊME VOLUME PERÇU** (#12285, web) — PURE.
 *
 * La passerelle ne réencode plus un vocal AAC : il garde son niveau d'origine,
 * et sa sonie intégrée EBU R128 est MESURÉE à l'ingestion et servie
 * (`Attachment.loudnessLufs`, #11259). La lecture applique
 * `LOUDNESS_TARGET_LUFS − loudnessLufs` dB, plafonné à `LOUDNESS_MAX_BOOST_DB`.
 * Champ absent ou `null` : gain nul, le comportement d'avant.
 *
 * Ce que la loi refuse, et pourquoi :
 * - une piste TRADUITE (TTS) n'est pas le fichier mesuré : elle se lit telle
 *   quelle ;
 * - amplifier exige le graphe Web Audio, donc une réponse CORS : sur une
 *   adresse qui ne la garantit pas, le graphe rendrait un SILENCE. On n'amplifie
 *   alors pas (`boostable`), jamais au prix du son ;
 * - atténuer passe par le volume de l'élément, sans graphe ni CORS.
 */
export const LOUDNESS_TARGET_LUFS = -16;

export const LOUDNESS_MAX_BOOST_DB = 12;

export function loudnessGainDb(lufs: number | null | undefined): number {
  if (typeof lufs !== 'number' || !Number.isFinite(lufs)) return 0;
  return Math.min(LOUDNESS_TARGET_LUFS - lufs, LOUDNESS_MAX_BOOST_DB);
}

export const dbToLinear = (db: number): number => 10 ** (db / 20);

export type LoudnessPlan =
  | { readonly kind: 'none' }
  | { readonly kind: 'attenuate'; readonly volume: number }
  | { readonly kind: 'boost'; readonly gain: number };

const NONE: LoudnessPlan = { kind: 'none' };

export function loudnessPlan(input: {
  readonly lufs: number | null | undefined;
  readonly playsOriginal: boolean;
  readonly boostable: boolean;
}): LoudnessPlan {
  if (!input.playsOriginal) return NONE;
  const db = loudnessGainDb(input.lufs);
  if (db < 0) return { kind: 'attenuate', volume: dbToLinear(db) };
  if (db > 0 && input.boostable) return { kind: 'boost', gain: dbToLinear(db) };
  return NONE;
}
