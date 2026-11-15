import { describe, it, expect } from '@jest/globals';
import {
  parseWaveformField,
  cleanWaveformSamples,
  pcm16ToWaveform,
  MAX_WAVEFORM_SAMPLES,
  COMPUTED_WAVEFORM_SAMPLES,
} from '../waveformSamples';

/** Encode des échantillons `Int16` en petit-boutiste — la forme que rend
 *  `ffmpeg -f s16le` (cf. `SoundCaptureService`). */
function pcm16le(samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => buf.writeInt16LE(s, i * 2));
  return buf;
}

/** Champ multipart de l'upload manuel — deuxième chemin de création d'un
 *  `Sound`. Purement décoratif : un champ malformé est ignoré, jamais une
 *  cause de rejet. On ne fait pas échouer l'envoi d'un fichier sur un ornement. */
describe('parseWaveformField', () => {
  it('test_validJSONArray_isParsed', () => {
    expect(parseWaveformField(JSON.stringify([0.2, 0.6, 0.9]))).toEqual([0.2, 0.6, 0.9]);
  });

  it('test_malformedJSON_yieldsEmptyArrayNotThrow', () => {
    expect(parseWaveformField('pas du json')).toEqual([]);
  });

  it('test_absentOrNonString_yieldsEmptyArray', () => {
    expect(parseWaveformField(undefined)).toEqual([]);
    expect(parseWaveformField('')).toEqual([]);
    expect(parseWaveformField(42)).toEqual([]);
  });

  it('test_jsonObjectNotArray_yieldsEmptyArray', () => {
    expect(parseWaveformField('{"a":1}')).toEqual([]);
  });

  it('test_nonNumericEntriesAreDropped', () => {
    expect(parseWaveformField('[0.2,"x",null,0.8]')).toEqual([0.2, 0.8]);
  });

  it('test_isCappedAtMaxSamples', () => {
    const big = JSON.stringify(new Array(5000).fill(0.5));
    expect(parseWaveformField(big)).toHaveLength(MAX_WAVEFORM_SAMPLES);
  });
});

describe('cleanWaveformSamples', () => {
  it('test_rejectsNaNAndInfinity', () => {
    // `Float[]` en Prisma/MongoDB n'accepte pas NaN, et `typeof NaN` vaut
    // 'number' : sans le test de finitude, la valeur entrerait en base.
    expect(cleanWaveformSamples([Number.NaN, Number.POSITIVE_INFINITY, 0.5])).toEqual([0.5]);
  });

  it('test_emptyResultBecomesUndefined', () => {
    expect(cleanWaveformSamples([])).toBeUndefined();
    expect(cleanWaveformSamples(['a', null])).toBeUndefined();
    expect(cleanWaveformSamples('nope')).toBeUndefined();
  });
});

/** #6602 — la SEULE couverture de la réduction PCM → forme d'onde CALCULÉE
 *  côté serveur (`SoundCaptureService`, quand le client n'en fournit aucune). */
describe('pcm16ToWaveform', () => {
  it('test_emptyBuffer_returnsEmptyArray', () => {
    expect(pcm16ToWaveform(Buffer.alloc(0))).toEqual([]);
  });

  it('test_singleSample_returnsItsNormalizedAmplitude', () => {
    // 16384 / 32768 = 0.5 exactement.
    expect(pcm16ToWaveform(pcm16le([16384]), 10)).toEqual([0.5]);
  });

  it('test_fullScaleSample_isCappedAtOne', () => {
    // -32768 est le minimum Int16 : son abs() (32768) doit rester ≤ 1 une
    // fois normalisé, jamais dépasser à cause de l'asymétrie du complément à 2.
    expect(pcm16ToWaveform(pcm16le([-32768]), 1)).toEqual([1]);
  });

  it('test_negativeSamples_useAbsoluteAmplitude', () => {
    expect(pcm16ToWaveform(pcm16le([-16384]), 10)).toEqual([0.5]);
  });

  it('test_bucketKeepsThePeakNotTheAverage', () => {
    // Un silence (0) suivi d'un pic (32767) dans la MÊME tranche : la
    // moyenne écraserait le pic à ~0.5, une forme d'onde qui « aplatit »
    // exactement ce que l'utilisateur doit voir pour choisir sa zone.
    const pcm = pcm16le([0, 32767, 0, 0]);
    expect(pcm16ToWaveform(pcm, 1)).toEqual([32767 / 32768]);
  });

  it('test_respectsTargetSampleCount', () => {
    const samples = new Array(1000).fill(0).map((_, i) => (i % 2 === 0 ? 20000 : -20000));
    expect(pcm16ToWaveform(pcm16le(samples), 50)).toHaveLength(50);
  });

  it('test_defaultsToComputedWaveformSamplesConstant', () => {
    const samples = new Array(COMPUTED_WAVEFORM_SAMPLES * 4).fill(30000);
    expect(pcm16ToWaveform(pcm16le(samples))).toHaveLength(COMPUTED_WAVEFORM_SAMPLES);
  });

  it('test_fewerRawSamplesThanTarget_returnsWhatItHas', () => {
    expect(pcm16ToWaveform(pcm16le([100, 200, 300]), 50)).toHaveLength(3);
  });

  it('test_nonPositiveTarget_returnsEmptyArray', () => {
    expect(pcm16ToWaveform(pcm16le([100, 200]), 0)).toEqual([]);
  });

  it('test_oddByteLength_ignoresTrailingByte', () => {
    // Un octet de tête isolé (flux tronqué) ne doit ni lever ni être lu
    // comme un demi-échantillon.
    const pcm = Buffer.concat([pcm16le([16384]), Buffer.from([0xff])]);
    expect(pcm16ToWaveform(pcm, 10)).toEqual([0.5]);
  });
});
