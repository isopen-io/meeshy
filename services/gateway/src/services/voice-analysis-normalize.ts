/**
 * Le format de fil de l'analyse vocale, tel que le traducteur l'ÉMET.
 *
 * `VoiceCharacteristics.to_dict()`
 * (`services/translator/src/services/voice_clone/voice_metadata.py`) rend un
 * objet imbriqué en snake_case. `VoiceAnalysisResult`
 * (`@meeshy/shared/types/voice-api`) en déclare un autre, en camelCase, que le
 * web rend à l'écran et que MongoDB persiste sous
 * `AttachmentTranscription.voiceQualityAnalysis`.
 *
 * **Aucune feuille des deux ne coïncide.** Quatre familles portent le même nom
 * au premier niveau — `pitch`, `mfcc`, `energy`, `classification` — ce qui
 * suffisait à faire croire les deux formes parentes ; `timbre` n'existe pas du
 * tout côté émetteur (il s'appelle `spectral`), et `quality`, `prosody`,
 * `metadata` n'étaient déclarés nulle part.
 *
 * `AudioTranslateService.analyzeVoice` CASTAIT le résultat brut en
 * `VoiceAnalysisResult` — un cast, donc un vœu. Ce que le cast promettait :
 *
 * ```
 * émis    : { pitch: { mean_hz }, spectral: { centroid_hz }, energy: { dynamic_range_db } }
 * déclaré : { pitch: { mean },    timbre:   { spectralCentroid }, energy: { dynamicRange } }
 * ```
 *
 * Coût mesuré : `calculateQualityMetrics` lit `analysis.energy.dynamicRange`
 * (`undefined` ⇒ `clarity = 0`), `analysis.pitch.std / analysis.pitch.mean`
 * (`0 / 1` ⇒ `consistency = 1`) et `analysis.classification.confidence`
 * (`undefined` ⇒ le défaut `0.5`). Le score valait donc
 * `0 × 0.4 + 1 × 0.3 + 0.5 × 0.3 = 0.45` **pour toute voix, toujours** : qualité
 * « fair », `suitableForCloning: false`. Une constante qui n'écoutait pas
 * l'audio, et dont les chiffres semblaient plausibles.
 *
 * Ce module est le seul endroit où la traduction de forme a lieu — la frontière
 * de confiance, là où le cast était.
 */
import type {
  VoiceAnalysisResult,
  VoiceComparisonResult,
  VoiceQualityAnalysis,
  VoiceProsodyAnalysis
} from '@meeshy/shared/types/voice-api';

type RawRecord = Record<string, unknown>;

const asRecord = (value: unknown): RawRecord =>
  typeof value === 'object' && value !== null ? (value as RawRecord) : {};

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asString = (value: unknown, fallback = 'unknown'): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const asNumbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number') : [];

/**
 * `confidence` est la SEULE valeur que l'émetteur range ailleurs que sous la
 * famille qui la décrit : elle vit sous `metadata`, pas sous `classification`.
 * C'est elle que `calculateQualityMetrics` pondère à 30 %, et sa lecture au
 * mauvais endroit est ce qui figeait le tiers restant du score.
 */
export function normalizeVoiceAnalysis(raw: unknown): VoiceAnalysisResult {
  const root = asRecord(raw);
  const pitch = asRecord(root.pitch);
  const spectral = asRecord(root.spectral);
  const energy = asRecord(root.energy);
  const classification = asRecord(root.classification);
  const mfcc = asRecord(root.mfcc);
  const metadata = asRecord(root.metadata);

  return {
    pitch: {
      mean: asNumber(pitch.mean_hz),
      std: asNumber(pitch.std_hz),
      min: asNumber(pitch.min_hz),
      max: asNumber(pitch.max_hz)
    },
    timbre: {
      spectralCentroid: asNumber(spectral.centroid_hz),
      spectralBandwidth: asNumber(spectral.bandwidth_hz),
      spectralRolloff: asNumber(spectral.rolloff_hz),
      spectralFlatness: asNumber(spectral.flatness)
    },
    mfcc: {
      mean: asNumbers(mfcc.mean),
      std: asNumbers(mfcc.std)
    },
    energy: {
      rms: asNumber(energy.mean),
      dynamicRange: asNumber(energy.dynamic_range_db)
    },
    classification: {
      voiceType: asString(classification.voice_type),
      gender: asString(classification.estimated_gender),
      ageRange: asString(classification.estimated_age_range),
      confidence: asNumber(metadata.confidence)
    }
  };
}

/**
 * `prosody` n'est rendue que si l'émetteur en a dit quelque chose.
 *
 * Fabriquer un bloc de zéros pour une analyse qui n'en portait pas
 * affirmerait un silence de 100 % et un débit nul — une lecture, là où il n'y a
 * qu'une absence. Le champ est optionnel dans `VoiceQualityAnalysis` ; l'omettre
 * est la seule façon de dire « non mesuré ».
 */
export function normalizeVoiceProsody(raw: unknown): VoiceProsodyAnalysis | undefined {
  const root = asRecord(raw);
  const energy = asRecord(root.energy);
  const prosody = asRecord(root.prosody);

  const hasEnergy = 'mean' in energy || 'std' in energy || 'silence_ratio' in energy;
  const hasProsody = 'speech_rate_wpm' in prosody;
  if (!hasEnergy && !hasProsody) return undefined;

  return {
    energyMean: asNumber(energy.mean),
    energyStd: asNumber(energy.std),
    silenceRatio: asNumber(energy.silence_ratio),
    speechRateWpm: asNumber(prosody.speech_rate_wpm)
  };
}

/**
 * La comparaison de voix porte la MÊME divergence que l'analyse, et il fallait
 * la prendre dans le même lot : `VoiceSimilarityResult.to_dict()` rend
 * `{ overall_score, components: { pitch_similarity, … }, is_likely_same_speaker,
 * confidence }` là où `VoiceComparisonResult` déclare `{ overallSimilarity,
 * pitchSimilarity, …, verdict, confidence }`. Seul `confidence` coïncide.
 *
 * **`verdict` n'a que deux valeurs atteignables, et c'est voulu.** L'émetteur ne
 * connaît qu'un seuil — `overall_score >= 0.75` — et n'exprime donc que
 * « même locuteur » ou « locuteur différent ». `'uncertain'` reste dans l'union
 * parce que les clients le typent déjà ; lui inventer ici une bande de scores
 * serait une décision produit que personne n'a prise, prise dans un adaptateur.
 */
export function normalizeVoiceComparison(raw: unknown): VoiceComparisonResult {
  const root = asRecord(raw);
  const components = asRecord(root.components);

  return {
    overallSimilarity: asNumber(root.overall_score),
    pitchSimilarity: asNumber(components.pitch_similarity),
    timbreSimilarity: asNumber(components.timbre_similarity),
    mfccSimilarity: asNumber(components.mfcc_similarity),
    energySimilarity: asNumber(components.energy_similarity),
    verdict: root.is_likely_same_speaker === true ? 'same_speaker' : 'different_speaker',
    confidence: asNumber(root.confidence)
  };
}

/**
 * Une analyse déjà PERSISTÉE (MongoDB) est au format déclaré, pas au format de
 * fil : elle traverse sans être retouchée. La détection se fait sur une clé que
 * seul l'émetteur pose — `pitch.mean_hz` —, jamais sur l'absence d'une clé
 * déclarée, qui confondrait « format de fil » et « analyse incomplète ».
 */
export function isRawTranslatorAnalysis(value: unknown): boolean {
  const pitch = asRecord(asRecord(value).pitch);
  return 'mean_hz' in pitch;
}

export function normalizeStoredAnalysis(value: unknown): VoiceQualityAnalysis | null {
  if (value === null || value === undefined) return null;
  if (!isRawTranslatorAnalysis(value)) return value as VoiceQualityAnalysis;

  const prosody = normalizeVoiceProsody(value);
  return {
    ...normalizeVoiceAnalysis(value),
    ...(prosody ? { prosody } : {})
  };
}
