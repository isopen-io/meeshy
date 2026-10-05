import { describe, it, expect } from '@jest/globals';
import { convertV1ToV3 } from '../storyEffectsV3';

/** Le filtre PROPRE à un objet posé et le filtre de SLIDE partagent la clé
 *  `payload.filter` en v3 (#8502). La règle, identique au pont Swift :
 *  le filtre de slide va au média de FOND ; celui d'un média posé reste sur
 *  lui ; aucun n'écrase l'autre. */
describe('filtre de slide et filtre d\'objet en v3', () => {
  const posed = { id: 'posed', postMediaId: '64b0000000000000000000aa', mediaType: 'image', x: 0.5, y: 0.5, filter: 'warm' };
  const fond = { id: 'fond', postMediaId: '64b0000000000000000000bb', mediaType: 'image', x: 0.5, y: 0.5, isBackground: true };

  const payloadOf = (blob: Record<string, unknown>, id: string) =>
    convertV1ToV3(blob).scenes[0].objects.find(o => o.id === id)?.payload;

  it('test_slideFilter_landsOnTheBackground_evenWhenAPosedMediaComesFirst', () => {
    const blob = { mediaObjects: [posed, fond], filter: 'bw' };
    expect(payloadOf(blob, 'fond')?.filter).toBe('bw');
    expect(payloadOf(blob, 'posed')?.filter).toBe('warm');
  });

  it('test_posedMediaFilter_survivesWithoutASlideFilter', () => {
    expect(payloadOf({ mediaObjects: [posed, fond] }, 'posed')?.filter).toBe('warm');
    expect(payloadOf({ mediaObjects: [posed, fond] }, 'fond')?.filter).toBeUndefined();
  });

  it('test_withoutBackground_theSlideFilterNeverOverwritesAPosedFilter', () => {
    const blob = { mediaObjects: [posed], filter: 'bw' };
    expect(payloadOf(blob, 'posed')?.filter).toBe('warm');
  });
});
