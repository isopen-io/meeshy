import { describe, it, expect } from '@jest/globals';
import { parseWaveformField, cleanWaveformSamples, MAX_WAVEFORM_SAMPLES } from '../waveformSamples';

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
