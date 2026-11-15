import { describe, expect, test } from 'bun:test';

import en from './personnes-en';
import es from './personnes-es';
import fr from './personnes-fr';
import pt from './personnes-pt';

/**
 * LA PRÉFÉRENCE `compressImagesOnUpload` DIT CE QU'ELLE FAIT (#11847, suite de
 * #11848). Elle n'active plus « la » compression : toute photo part déjà
 * compressée une fois, en HD et sans perte visible (#11247). Cocher la
 * préférence demande la compression FORTE (720p), qui économise les données.
 * La console d'administration la nomme comme les réglages iOS
 * (`settings.media.outgoing.compress.title`).
 */
const KEY = 'admin.people.pref.document.compressImagesOnUpload';

describe('le libellé admin de compressImagesOnUpload', () => {
  test('il nomme la compression FORTE, dans les mots des réglages iOS', () => {
    expect(fr[KEY]).toBe('Compression forte des photos et vidéos');
    expect(en[KEY]).toBe('Strong photo and video compression');
    expect(es[KEY]).toBe('Compresión fuerte de fotos y vídeos');
    expect(pt[KEY]).toBe('Compressão forte de fotos e vídeos');
  });
});
