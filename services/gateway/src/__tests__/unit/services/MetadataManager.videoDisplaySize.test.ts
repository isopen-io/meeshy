/**
 * #14609 — une vidéo filmée téléphone tenu droit s'enregistre avec sa taille d'AFFICHAGE : la rotation de la
 * piste échange largeur et hauteur. Extrait de MetadataManager.test.ts, déjà au-delà du budget de taille (#4531).
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { FfprobeStream } from 'fluent-ffmpeg';

const mockFfprobe = jest.fn() as jest.MockedFunction<any>;

jest.mock('sharp', () => jest.fn());
jest.mock('pdf-parse', () => ({ PDFParse: class {} }));
jest.mock('fluent-ffmpeg', () => ({ ffprobe: mockFfprobe }));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

import { MetadataManager } from '../../../services/attachments/MetadataManager';

describe('MetadataManager — taille d’affichage d’une vidéo (#14609)', () => {
  it('records a video filmed upright on a phone with its portrait display size', async () => {
    mockFfprobe.mockImplementation((_path: string, callback: Function) => {
      callback(null, {
        streams: [{ codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] } as FfprobeStream],
        format: {},
      });
    });

    const result = await new MetadataManager('/test/uploads').extractVideoMetadata('test/portrait.mp4');

    expect({ width: result.width, height: result.height }).toEqual({ width: 1080, height: 1920 });
  });
});
