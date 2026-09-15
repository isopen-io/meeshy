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

/**
 * LA SIXIÈME FORME — L'ADRESSE HÉRITÉE QUI PORTE UNE CLÉ, SANS SA ROUTE.
 *
 * Mesurée le 2026-09-13 sur `staging.meeshy.me/notifications` :
 * `GET https://gate.meeshy.me/2026/09/<id>/harbor_<uuid>.png net::ERR_FAILED`,
 * puis `workbox … no-response` — le service worker relaie l'échec réseau sans
 * pouvoir servir quoi que ce soit. L'adresse ment DEUX fois : elle désigne la
 * RACINE de la passerelle, où aucune route ne sert de fichier, et elle nomme
 * l'hôte de PRODUCTION depuis une page de STAGING (une base restaurée depuis
 * un dump — le risque que le doc-comment de la migration 013 nomme mot pour
 * mot).
 *
 * La migration 013 (`scripts/migrations/mongodb/013_store_media_keys_not_urls.js`)
 * ne réécrit QUE les valeurs qui portent `/attachments/file/` : une adresse
 * héritée sans ce segment lui échappe, et elle est encore en base. Le legacy
 * la RÉPARE depuis toujours (`apps/web/utils/attachment-url.ts`, branche
 * « URL mal formée ») ; le chantier la laissait passer parce qu'une chaîne
 * `https://…` y valait « déjà résolue ».
 *
 * LA RÉPARATION SE FAIT CONTRE LA BASE CONFIGURÉE, jamais contre l'hôte que
 * l'adresse porte : c'est la clé qui identifie le fichier, l'hôte est une
 * décision de déploiement (#4324) — et sur staging, l'hôte écrit en base est
 * le mauvais.
 */
describe('resolveAttachmentSrc — l’adresse héritée sans route (#6388)', () => {
  test('une adresse qui porte la clé NUE derrière un hôte devient la route de flux de la base CONFIGURÉE', () => {
    expect(
      resolveAttachmentSrc(
        'https://gate.meeshy.me/2026/09/6aa607414ffea5f6989529bf/harbor_415810f3-d027-4da2-aa8d-2b2a489bb44e.png',
        'https://gate.staging.meeshy.me',
      ),
    ).toBe(
      'https://gate.staging.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607414ffea5f6989529bf%2Fharbor_415810f3-d027-4da2-aa8d-2b2a489bb44e.png',
    );
  });

  test('la clé est DÉCODÉE puis ré-encodée une seule fois — jamais de double %25', () => {
    expect(resolveAttachmentSrc('https://gate.meeshy.me/2026/09/mon%20fichier.png', 'https://gate.meeshy.me')).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fmon%20fichier.png',
    );
  });

  test('une adresse qui porte DÉJÀ la route de flux traverse INCHANGÉE — jamais une seconde route', () => {
    expect(
      resolveAttachmentSrc('https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fphoto.png', 'https://gate.staging.meeshy.me'),
    ).toBe('https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fphoto.png');
  });

  /**
   * LA MÊME FORME, SANS L'HÔTE — `/2026/09/<id>/photo.png`. Le legacy la répare
   * au même titre (`apps/web/utils/attachment-url.ts`, § « chemin de date ») :
   * une barre initiale n'en fait pas une ROUTE, et `${base}/2026/09/…` rend
   * exactement l'adresse que la console de staging montrait.
   */
  test('un chemin de DATE (barre initiale, pas de route) devient la route de flux', () => {
    expect(resolveAttachmentSrc('/2026/09/6aa607/harbor_41.png', 'https://gate.staging.meeshy.me')).toBe(
      'https://gate.staging.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607%2Fharbor_41.png',
    );
  });

  test('un chemin qui porte DÉJÀ la route de flux garde sa forme — seule la base s’ajoute', () => {
    expect(resolveAttachmentSrc('/api/v1/attachments/file/2026%2F09%2Fphoto.png', 'https://gate.meeshy.me')).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fphoto.png',
    );
  });

  test('le magasin STATIQUE traverse INCHANGÉ — ses avatars ne sont pas sur la passerelle (#4625)', () => {
    expect(resolveAttachmentSrc('https://static.meeshy.me/u/i/2025/11/avatar_1763143871947_o0.jpg', 'https://gate.meeshy.me')).toBe(
      'https://static.meeshy.me/u/i/2025/11/avatar_1763143871947_o0.jpg',
    );
  });

  test('une adresse EXTERNE sans forme de clé traverse INCHANGÉE', () => {
    expect(resolveAttachmentSrc('https://cdn.example.com/photo.png', 'https://gate.meeshy.me')).toBe('https://cdn.example.com/photo.png');
  });
});
