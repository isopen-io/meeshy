import { describe, expect, test } from 'bun:test';

import type { ApiResult } from './http';
import type { Attachment } from './types';
import { UPLOAD_FORMAT_REFUSED, uploadShortfall } from './attachments';

/**
 * W9 (#11315) — UN LOT DE PIÈCES QUI REVIENT INCOMPLET DIT POURQUOI. La
 * passerelle avale un fichier refusé SOUS `success: true` ; un HEIC qu'un
 * serveur d'avant S8 ne sait pas convertir disparaissait donc derrière
 * « une pièce n'a pas pu être téléversée ». Quand le lot porte un HEIC, la
 * cause se nomme : le FORMAT.
 */
const file = (name: string, type: string) => ({ name, type });
const served = (count: number): ApiResult<{ readonly attachments: readonly Attachment[] }> => ({
  ok: true,
  data: { attachments: Array.from({ length: count }, (_, i) => ({ id: `a${i}` }) as Attachment) },
});

describe('uploadShortfall — le verdict d’un lot téléversé', () => {
  test('autant de pièces que de fichiers : aucun échec', () => {
    expect(uploadShortfall([file('a.heic', 'image/heic')], served(1))).toBeNull();
  });

  test('un lot incomplet SANS HEIC reste UPLOAD_PARTIAL', () => {
    expect(uploadShortfall([file('a.png', 'image/png'), file('b.png', 'image/png')], served(1))).toMatchObject({ code: 'UPLOAD_PARTIAL' });
  });

  test('un lot incomplet qui porte un HEIC (typé ou par son extension) : le FORMAT est la cause', () => {
    expect(uploadShortfall([file('a.png', 'image/png'), file('IMG_1.HEIC', '')], served(1))).toMatchObject({ code: UPLOAD_FORMAT_REFUSED });
    expect(uploadShortfall([file('IMG_1.heic', 'image/heic')], served(0))).toMatchObject({ code: UPLOAD_FORMAT_REFUSED });
  });

  test('un 415 sur un lot qui porte un HEIC : le FORMAT ; sur un autre lot, l’échec tel quel', () => {
    const refused: ApiResult<{ readonly attachments: readonly Attachment[] }> = { ok: false, status: 415, error: 'Unsupported media type' };
    expect(uploadShortfall([file('IMG_1.heic', 'image/heic')], refused)).toMatchObject({ status: 415, code: UPLOAD_FORMAT_REFUSED });
    expect(uploadShortfall([file('a.png', 'image/png')], refused)).toEqual(refused);
  });

  test('un autre échec (réseau, 500) traverse inchangé, même avec un HEIC', () => {
    const offline: ApiResult<{ readonly attachments: readonly Attachment[] }> = { ok: false, status: 0, error: 'offline' };
    expect(uploadShortfall([file('IMG_1.heic', 'image/heic')], offline)).toEqual(offline);
  });
});
