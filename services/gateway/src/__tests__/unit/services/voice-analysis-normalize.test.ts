/**
 * La frontière de confiance entre le traducteur et le contrat client.
 *
 * Les charges utiles de ce fichier ne sont pas inventées : elles ont été
 * CAPTURÉES en exécutant `OperationHandlers.handle_analyze` et
 * `handle_compare` contre le vrai `VoiceAnalyzerService`, une fois les deux
 * appels morts réparés (cycle 90). Toute dérive future du format de fil doit
 * faire tomber ces témoins — c'est leur seule raison d'être.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import {
  isRawTranslatorAnalysis,
  normalizeStoredAnalysis,
  normalizeVoiceAnalysis,
  normalizeVoiceComparison,
  normalizeVoiceProsody
} from '../../../services/voice-analysis-normalize';

/**
 * `VoiceCharacteristics.to_dict()` — capture littérale, valeurs rendues
 * distinctes pour qu'aucune confusion de champ ne puisse passer inaperçue.
 */
function rawTranslatorAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    pitch: { mean_hz: 152.5, std_hz: 24.5, min_hz: 98.25, max_hz: 233.75, range_hz: 135.5 },
    classification: {
      voice_type: 'medium_male',
      estimated_gender: 'male',
      estimated_age_range: 'adult'
    },
    spectral: {
      centroid_hz: 1820.5,
      bandwidth_hz: 1640.25,
      rolloff_hz: 3480.75,
      flatness: 0.0421,
      brightness: 1820.5,
      warmth: 0.62,
      breathiness: 0.18,
      nasality: 0.09
    },
    energy: { mean: 0.0834, std: 0.0217, dynamic_range_db: 42.5, silence_ratio: 0.235 },
    quality: { harmonics_to_noise: 14.75, jitter: 0.0128, shimmer: 0.0341 },
    prosody: { speech_rate_wpm: 142.5 },
    mfcc: { mean: [-282.4, 91.6, -13.2], std: [41.7, 18.3, 9.4] },
    metadata: {
      sample_rate: 22050,
      bit_depth: 16,
      channels: 1,
      codec: 'wav',
      duration_seconds: 8.42,
      analysis_time_ms: 317,
      confidence: 0.82
    },
    ...overrides
  };
}

/** `VoiceSimilarityResult.to_dict()` — même provenance. */
function rawTranslatorComparison(overrides: Record<string, unknown> = {}) {
  return {
    overall_score: 0.813,
    is_likely_same_speaker: true,
    confidence: 0.79,
    components: {
      pitch_similarity: 0.88,
      timbre_similarity: 0.76,
      mfcc_similarity: 0.83,
      energy_similarity: 0.71
    },
    details: {},
    analysis_time_ms: 642,
    ...overrides
  };
}

describe('normalizeVoiceAnalysis — le format de fil devient le contrat déclaré', () => {
  it('lit le pitch sous ses clés `_hz`, que le contrat nomme sans suffixe', () => {
    const { pitch } = normalizeVoiceAnalysis(rawTranslatorAnalysis());

    expect(pitch).toEqual({ mean: 152.5, std: 24.5, min: 98.25, max: 233.75 });
  });

  it('rend `timbre` depuis `spectral` — la famille qui n’existe sous aucun des deux noms à la fois', () => {
    const { timbre } = normalizeVoiceAnalysis(rawTranslatorAnalysis());

    expect(timbre).toEqual({
      spectralCentroid: 1820.5,
      spectralBandwidth: 1640.25,
      spectralRolloff: 3480.75,
      spectralFlatness: 0.0421
    });
  });

  it('rend `energy.dynamicRange` depuis `dynamic_range_db` — la valeur dont dépend `clarity`', () => {
    const { energy } = normalizeVoiceAnalysis(rawTranslatorAnalysis());

    expect(energy.dynamicRange).toBe(42.5);
    expect(energy.rms).toBe(0.0834);
  });

  it('va chercher `classification.confidence` sous `metadata`, seul champ que l’émetteur range ailleurs', () => {
    const { classification } = normalizeVoiceAnalysis(rawTranslatorAnalysis());

    expect(classification).toEqual({
      voiceType: 'medium_male',
      gender: 'male',
      ageRange: 'adult',
      confidence: 0.82
    });
  });

  it('rend les MFCC en moyenne et écart-type, sans fabriquer de `coefficients`', () => {
    const { mfcc } = normalizeVoiceAnalysis(rawTranslatorAnalysis());

    expect(mfcc.mean).toEqual([-282.4, 91.6, -13.2]);
    expect(mfcc.std).toEqual([41.7, 18.3, 9.4]);
    expect(mfcc.coefficients).toBeUndefined();
  });

  it('rend une forme complète et neutre quand l’émetteur n’a rien envoyé', () => {
    const result = normalizeVoiceAnalysis(undefined);

    expect(result.pitch.mean).toBe(0);
    expect(result.timbre.spectralCentroid).toBe(0);
    expect(result.classification.voiceType).toBe('unknown');
  });

  it('ignore une valeur non finie plutôt que de la servir', () => {
    const raw = rawTranslatorAnalysis({ pitch: { mean_hz: Number.NaN, std_hz: 3 } });

    expect(normalizeVoiceAnalysis(raw).pitch.mean).toBe(0);
  });
});

describe('normalizeVoiceProsody — l’absence se dit en n’écrivant rien', () => {
  it('rend la prosodie en assemblant `energy` et `prosody`', () => {
    expect(normalizeVoiceProsody(rawTranslatorAnalysis())).toEqual({
      energyMean: 0.0834,
      energyStd: 0.0217,
      silenceRatio: 0.235,
      speechRateWpm: 142.5
    });
  });

  it('rend `undefined` — jamais un bloc de zéros — quand rien n’a été mesuré', () => {
    expect(normalizeVoiceProsody({ pitch: { mean_hz: 100 } })).toBeUndefined();
  });
});

describe('normalizeVoiceComparison — la jumelle, prise dans le même lot', () => {
  it('remonte les similarités depuis `components`, que le contrat déclare à plat', () => {
    expect(normalizeVoiceComparison(rawTranslatorComparison())).toEqual({
      overallSimilarity: 0.813,
      pitchSimilarity: 0.88,
      timbreSimilarity: 0.76,
      mfccSimilarity: 0.83,
      energySimilarity: 0.71,
      verdict: 'same_speaker',
      confidence: 0.79
    });
  });

  it('traduit `is_likely_same_speaker: false` en `different_speaker`', () => {
    const raw = rawTranslatorComparison({ is_likely_same_speaker: false });

    expect(normalizeVoiceComparison(raw).verdict).toBe('different_speaker');
  });
});

describe('normalizeStoredAnalysis — deux écrivains, un seul lecteur', () => {
  it('normalise un document écrit au format de FIL', () => {
    const stored = normalizeStoredAnalysis(rawTranslatorAnalysis());

    expect(stored?.timbre.spectralCentroid).toBe(1820.5);
    expect(stored?.prosody?.speechRateWpm).toBe(142.5);
  });

  it('laisse passer INTACT un document déjà au format déclaré, métriques comprises', () => {
    const declared = {
      pitch: { mean: 150, std: 20, min: 100, max: 200 },
      timbre: { spectralCentroid: 1, spectralBandwidth: 2, spectralRolloff: 3, spectralFlatness: 4 },
      mfcc: { mean: [], std: [] },
      energy: { rms: 0.1, dynamicRange: 40 },
      classification: { voiceType: 'x', gender: 'y', ageRange: 'z', confidence: 0.5 },
      qualityMetrics: {
        overallScore: 0.71,
        clarity: 0.66,
        consistency: 0.86,
        suitableForCloning: true,
        trainingQuality: 'good' as const
      }
    };

    expect(normalizeStoredAnalysis(declared)).toEqual(declared);
  });

  it('rend `null` pour une absence, jamais une analyse vide', () => {
    expect(normalizeStoredAnalysis(null)).toBeNull();
    expect(normalizeStoredAnalysis(undefined)).toBeNull();
  });

  it('tranche sur une clé que seul l’émetteur pose, pas sur l’absence d’une clé déclarée', () => {
    expect(isRawTranslatorAnalysis(rawTranslatorAnalysis())).toBe(true);
    expect(isRawTranslatorAnalysis({ pitch: { mean: 150 } })).toBe(false);
    expect(isRawTranslatorAnalysis({ classification: { voiceType: 'x' } })).toBe(false);
  });
});
