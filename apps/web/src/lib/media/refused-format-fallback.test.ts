import { describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';

import { createImagePreparer, type ImagePort } from './prepare-image-upload';
import { sendWithFormatFallback } from './refused-format-fallback';

/**
 * **UN HEIC REFUSÉ PAR UN ANCIEN SERVEUR** (#13416, après l'incident #13412) —
 * un serveur qui ne sait pas lire la photo d'un iPhone récent répond 415. Le
 * navigateur qui sait la décoder (Safari) la convertit et la renvoie ; celui
 * qui ne sait pas rend l'échec tel quel, et le brouillon reste.
 */

const heic = () => new File([new Uint8Array([0, 0, 0, 24])], 'IMG_0001.HEIC', { type: 'image/heic' });

const refused: ApiResult<string> = { ok: false, status: 415, error: 'Image format not supported by the server' };

const decoding = (blob: Blob | null): ImagePort => () => Promise.resolve(blob);

describe('sendWithFormatFallback — un 415 sur une photo HEIC', () => {
  test('le navigateur sait la décoder : elle repart convertie, et c’est cet envoi qui compte', async () => {
    const sent: File[] = [];
    const transcode = createImagePreparer(decoding(new Blob([new Uint8Array(4)], { type: 'image/jpeg' }))).transcode;
    const result = await sendWithFormatFallback(heic(), async (file) => (sent.push(file), sent.length === 1 ? refused : { ok: true, data: 'pm-1' }), transcode);
    expect(result).toEqual({ ok: true, data: 'pm-1' });
    expect(sent.map((file) => [file.name, file.type])).toEqual([
      ['IMG_0001.HEIC', 'image/heic'],
      ['IMG_0001.jpg', 'image/jpeg'],
    ]);
  });

  test('le navigateur ne sait pas la décoder : l’échec du serveur est rendu, sans second envoi', async () => {
    const sent: File[] = [];
    const transcode = createImagePreparer(decoding(null)).transcode;
    expect(await sendWithFormatFallback(heic(), async (file) => (sent.push(file), refused), transcode)).toEqual(refused);
    expect(sent).toHaveLength(1);
  });

  test('ni un JPEG refusé, ni un HEIC refusé pour une autre raison ne sont convertis', async () => {
    let transcoded = 0;
    const transcode = async () => ((transcoded += 1), null);
    const jpeg = new File([new Uint8Array(4)], 'a.jpg', { type: 'image/jpeg' });
    await sendWithFormatFallback(jpeg, async () => refused, transcode);
    await sendWithFormatFallback(heic(), async () => ({ ok: false, status: 413, error: 'trop gros' }), transcode);
    expect(transcoded).toBe(0);
  });

  test('un HEIC reconnu à son nom quand le navigateur ne donne aucun type', async () => {
    const sent: File[] = [];
    const nameless = new File([new Uint8Array(4)], 'photo.heif', { type: '' });
    const transcode = createImagePreparer(decoding(new Blob([new Uint8Array(4)], { type: 'image/webp' }))).transcode;
    await sendWithFormatFallback(nameless, async (file) => (sent.push(file), sent.length === 1 ? refused : { ok: true, data: 'pm-1' }), transcode);
    expect(sent[1]?.type).toBe('image/webp');
  });
});
