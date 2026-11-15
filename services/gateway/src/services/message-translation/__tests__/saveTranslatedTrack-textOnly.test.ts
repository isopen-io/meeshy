/**
 * #16340 — une traduction TEXTE SEULE (la TTS du translator a échoué)
 * n'annonce aucune adresse de piste.
 *
 * Sans binaire, `saveTranslatedTrack` annonce l'adresse attendue (le binaire
 * « suit par un autre chemin »). Pour une traduction dont la voix n'existe
 * pas, cette adresse serait morte : la bulle et le plein écran joueraient un
 * 404 à la place de la voix originale. Le translator le déclare
 * (`textOnly: true`) ; la traduction garde son texte, sans `path` ni `url`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

import { saveTranslatedTrack } from '../translatedTrackSave';

const prisma = {} as Parameters<typeof saveTranslatedTrack>[0];
const track = { translatedDir: '/tmp/translated', filename: 'att_en.mp3', attachmentId: 'att', language: 'en' };

describe('la piste d’une traduction texte seule', () => {
  it('n’annonce ni chemin ni adresse', async () => {
    const location = await saveTranslatedTrack(prisma, { ...track, textOnly: true });
    expect(location).toEqual({});
  });

  it('une piste sans binaire, mais pas texte seule, garde son adresse attendue', async () => {
    const location = await saveTranslatedTrack(prisma, track);
    expect(location.url).toBe('/api/v1/attachments/file/translated/att_en.mp3');
  });
});
