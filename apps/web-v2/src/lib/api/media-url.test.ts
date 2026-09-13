import { describe, expect, test } from 'bun:test';

import { attachmentSrcSet, resolveAttachmentSrc, sizesFor } from './media-url';
import type { ImageVariant } from './types';

/**
 * `resolveAttachmentSrc` — défaut 2 de la revue #5668 : `Attachment.fileUrl`
 * sert un chemin RELATIF (`/api/v1/attachments/file/…`, mesuré sur
 * `gate.staging.meeshy.me`) que le navigateur résout contre l'origine du
 * DOCUMENT, jamais contre la passerelle — sauf en DEV, où le proxy Vite le
 * masque. PURE, comme `resolveApiConfig` (`config.test.ts`) : la base est un
 * paramètre, aucune dépendance à `import.meta.env`.
 */
describe('resolveAttachmentSrc — les quatre formes de fileUrl', () => {
  test('relative (le cas RÉEL de la passerelle) : préfixée par la base', () => {
    expect(resolveAttachmentSrc('/api/v1/attachments/file/2026%2F09%2Fphoto.png', 'https://gate.meeshy.me')).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fphoto.png',
    );
  });

  test('relative avec une base VIDE (dev, proxé par Vite) : inchangée', () => {
    expect(resolveAttachmentSrc('/api/v1/attachments/file/photo.png', '')).toBe('/api/v1/attachments/file/photo.png');
  });

  test('absolue (https://…) : jamais re-préfixée', () => {
    expect(resolveAttachmentSrc('https://cdn.example.com/photo.png', 'https://gate.meeshy.me')).toBe(
      'https://cdn.example.com/photo.png',
    );
  });

  test('blob: (aperçu optimiste local, `attachmentPreviewOf`) : jamais re-préfixée', () => {
    expect(resolveAttachmentSrc('blob:https://staging.meeshy.me/abcd-1234', 'https://gate.meeshy.me')).toBe(
      'blob:https://staging.meeshy.me/abcd-1234',
    );
  });

  test('data: : jamais re-préfixée', () => {
    expect(resolveAttachmentSrc('data:image/png;base64,AA==', 'https://gate.meeshy.me')).toBe('data:image/png;base64,AA==');
  });

  test("vide (fixtures sans image) : inchangée — c'est le signal « pas d'image »", () => {
    expect(resolveAttachmentSrc('', 'https://gate.meeshy.me')).toBe('');
  });
});

/**
 * LA CINQUIÈME FORME, ET LA PLUS RÉPANDUE (revue #5805) — la CLÉ DE STOCKAGE
 * NUE, `2026/09/<id>/photo.png`, SANS barre initiale.
 *
 * Le lot #5668 n'avait mesuré qu'un compte (`cible-web-trois`) et n'y avait vu
 * que la forme déjà résolue ; la passerelle sert LES DEUX, et la nue est la
 * majoritaire — relevé le 2026-09-12 sur `gate.staging.meeshy.me` avec le
 * compte de démonstration : sur les cinq pièces jointes des conversations
 * « Meeshy Global », « Meeshy Daily… » et « Conversation with Meeshy Sama »,
 * quatre sont nues et une seule est résolue.
 *
 * CE QUE LA FORME NUE PRODUISAIT — pire qu'une erreur : posée telle quelle en
 * `src`, le navigateur la résout contre le CHEMIN du document
 * (`https://staging.meeshy.me/c/<id>/2026/09/…png`), où le SPA répond
 * `200 text/html` — son propre `index.html`. L'`<img>` reçoit donc du HTML,
 * échoue à le décoder, `onError` la masque, et la rangée affiche son repli
 * d'image CASSÉE. Un échec de RÉSOLUTION déguisé en fichier corrompu, que
 * rien ne distingue à l'écran d'une pièce réellement abîmée
 * (`tasks/lessons.md` — « une erreur avalée en VIDE se lit comme un vide
 * légitime »).
 *
 * LA CIBLE EST MESURÉE, jamais devinée : `GET /attachments/file/*`
 * (`services/gateway/src/routes/attachments/download.ts:266-273`, monté sous
 * `/api/v1` ET sous le legacy `/api`) rend `200 image/png` sur la clé nue
 * d'une pièce existante — c'est exactement la forme que la passerelle
 * sérialise elle-même pour l'autre moitié de ses lignes.
 */
describe('resolveAttachmentSrc — la clé de stockage NUE (#5805)', () => {
  test('une clé nue devient la route de flux de la passerelle, jamais un chemin relatif au document', () => {
    expect(resolveAttachmentSrc('2026/09/6a9fa839/sticker_020D2E72.png', 'https://gate.meeshy.me')).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F6a9fa839%2Fsticker_020D2E72.png',
    );
  });

  test('base VIDE (dev, proxé par Vite) : la route reste relative mais devient la BONNE route', () => {
    expect(resolveAttachmentSrc('2026/09/photo.png', '')).toBe('/api/v1/attachments/file/2026%2F09%2Fphoto.png');
  });

  test('la clé est ENCODÉE — un nom d’origine à espaces ou à dièse ne casse pas la route', () => {
    expect(resolveAttachmentSrc('2026/09/mon fichier #1.png', 'https://gate.meeshy.me')).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fmon%20fichier%20%231.png',
    );
  });

  test('la forme DÉJÀ résolue n’est jamais ré-encodée (pas de double %2F)', () => {
    expect(resolveAttachmentSrc('/api/v1/attachments/file/2026%2F09%2Fphoto.png', 'https://gate.meeshy.me')).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fphoto.png',
    );
  });
});

/**
 * `attachmentSrcSet`/`sizesFor` (#6221, D4 §1.4.4) — la variante ÉLUE par la
 * largeur d'affichage, sous sa forme NATIVE navigateur.
 */
describe('attachmentSrcSet — la forme native du srcset', () => {
  const variant = (width: number, url: string): ImageVariant => ({
    width,
    height: Math.round((width * 2) / 3),
    url,
    size: 1000,
    format: 'webp',
  });

  test('chaque variante passe par attachmentSrc — même route que fileUrl, jamais une seconde résolution', () => {
    const variants = [variant(320, '2026/09/a-320.webp'), variant(640, '2026/09/a-640.webp')];
    expect(attachmentSrcSet(variants)).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fa-320.webp 320w, ' +
        'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fa-640.webp 640w',
    );
  });

  test('undefined ou liste vide : undefined — jamais un srcset vide', () => {
    expect(attachmentSrcSet(undefined)).toBeUndefined();
    expect(attachmentSrcSet([])).toBeUndefined();
  });

  test('sizesFor(149) = "149px"', () => {
    expect(sizesFor(149)).toBe('149px');
  });
});
