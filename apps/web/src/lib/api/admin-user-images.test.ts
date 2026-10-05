import { describe, expect, test } from 'bun:test';

import {
  decodeAdminProfileImageCandidates,
  loadAdminProfileImageCandidates,
  performAdminImageUpload,
  setAdminUserImage,
} from './admin-user-images';
import type { HttpRequest, HttpTransport } from './http';

/**
 * LA PHOTO ET LA BANNIÈRE D'UN MEMBRE, POSÉES PAR L'ADMINISTRATION (#8217) —
 * `PUT /api/v1/admin/users/:userId/profile-images/:kind` et
 * `GET /api/v1/admin/users/:userId/profile-image-candidates`.
 *
 * Deux voies, une seule adresse d'écriture : un téléversement (`upload` + son
 * URL servie) ou une image DÉJÀ publique du membre (`media` + son id). Le
 * port ne décide pas de l'éligibilité — la passerelle la tient, par la même
 * requête pour la liste et pour l'écriture — il transporte le choix.
 */

const MEMBRE_SERVI = {
  id: 'u-1',
  username: 'amina',
  displayName: 'Amina Diallo',
  email: 'amina@example.test',
  role: 'USER',
  isActive: true,
  avatar: '/api/v1/attachments/file/up/a.webp',
  banner: '',
};

type Appel = { readonly path: string; readonly method: string; readonly body: unknown };

const transportScenarise = (repondre: (requete: HttpRequest) => unknown) => {
  const appels: Appel[] = [];
  const transport = {
    request: async (requete: HttpRequest) => {
      appels.push({ path: requete.path, method: requete.method, body: requete.body });
      return repondre(requete);
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

describe('setAdminUserImage — l’adresse, le corps, ce qui revient', () => {
  test('vise PUT …/profile-images/:kind, identifiant ENCODÉ, source MÉDIA', async () => {
    const { transport, appels } = transportScenarise(() => ({ ok: true, data: MEMBRE_SERVI }));

    const resultat = await setAdminUserImage({
      ...deps(transport),
      userId: 'u 1/x',
      kind: 'banner',
      choice: { source: 'media', mediaId: 'm-1' },
      reason: '  demandé par le membre ',
    });

    expect(appels[0]).toEqual({
      method: 'PUT',
      path: `/api/v1/admin/users/${encodeURIComponent('u 1/x')}/profile-images/banner`,
      body: { source: 'media', mediaId: 'm-1', reason: 'demandé par le membre' },
    });
    expect(resultat.ok && resultat.data.avatar).toBe('/api/v1/attachments/file/up/a.webp');
  });

  test('retirer envoie `none`, sans motif vide', async () => {
    const { transport, appels } = transportScenarise(() => ({ ok: true, data: MEMBRE_SERVI }));

    await setAdminUserImage({ ...deps(transport), userId: 'u-1', kind: 'avatar', choice: { source: 'none' }, reason: '   ' });

    expect(appels[0]?.body).toEqual({ source: 'none' });
  });

  test('relaie le refus de la passerelle, code compris', async () => {
    const { transport } = transportScenarise(() => ({ ok: false, status: 400, error: 'refus', code: 'PROFILE_IMAGE_NOT_ELIGIBLE' }));

    const resultat = await setAdminUserImage({ ...deps(transport), userId: 'u-1', kind: 'avatar', choice: { source: 'media', mediaId: 'm-1' } });

    expect(resultat).toEqual({ ok: false, status: 400, error: 'refus', code: 'PROFILE_IMAGE_NOT_ELIGIBLE' });
  });
});

describe('performAdminImageUpload — téléverser PUIS poser', () => {
  const fichier = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
  const recompress = async (file: Blob) => file;

  test('monte l’image recompressée, puis pose l’URL servie comme source `upload`', async () => {
    const { transport, appels } = transportScenarise((requete) =>
      requete.path === '/api/v1/attachments/upload'
        ? { ok: true, data: { attachments: [{ fileUrl: '/api/v1/attachments/file/up/new.jpg' }] } }
        : { ok: true, data: { ...MEMBRE_SERVI, avatar: '/api/v1/attachments/file/up/new.jpg' } },
    );

    const issue = await performAdminImageUpload({
      userId: 'u-1',
      kind: 'avatar',
      file: fichier,
      deps: { ...deps(transport), isOnline: () => true, recompress },
    });

    expect(appels.map((a) => `${a.method} ${a.path}`)).toEqual([
      'POST /api/v1/attachments/upload',
      'PUT /api/v1/admin/users/u-1/profile-images/avatar',
    ]);
    expect(appels[1]?.body).toEqual({ source: 'upload', url: '/api/v1/attachments/file/up/new.jpg' });
    expect(issue.status === 'saved' && issue.membre.avatar).toBe('/api/v1/attachments/file/up/new.jpg');
  });

  test('hors ligne, rien ne part', async () => {
    const { transport, appels } = transportScenarise(() => ({ ok: true, data: {} }));

    const issue = await performAdminImageUpload({
      userId: 'u-1',
      kind: 'banner',
      file: fichier,
      deps: { ...deps(transport), isOnline: () => false, recompress },
    });

    expect(issue.status).toBe('offline');
    expect(appels).toEqual([]);
  });

  test('un refus de la pose remonte avec son statut — un 403 est un RANG, pas une panne (#8289)', async () => {
    const { transport } = transportScenarise((requete) =>
      requete.path === '/api/v1/attachments/upload'
        ? { ok: true, data: { attachments: [{ fileUrl: '/f.jpg' }] } }
        : { ok: false, status: 403, error: 'Hiérarchie insuffisante' },
    );

    const issue = await performAdminImageUpload({
      userId: 'u-1',
      kind: 'avatar',
      file: fichier,
      deps: { ...deps(transport), isOnline: () => true, recompress },
    });

    expect(issue).toEqual({ status: 'refused', error: 'Hiérarchie insuffisante', httpStatus: 403 });
  });
});

describe('les images candidates — celles que le membre a déjà rendues publiques', () => {
  test('lit la page servie À CÔTÉ de `data`, et écarte les lignes sans id ni adresse', () => {
    const page = decodeAdminProfileImageCandidates(
      {
        lignes: [
          { id: 'm-1', fileUrl: '/p1.jpg', thumbnailUrl: '/p1-t.jpg', mimeType: 'image/jpeg', createdAt: '2026-09-01T10:00:00.000Z' },
          { id: '', fileUrl: '/p2.jpg' },
          { id: 'm-3', fileUrl: '' },
          { id: 'm-4', fileUrl: '/p4.png', thumbnailUrl: null },
        ],
        meta: { total: 3, hasMore: false },
      },
      0,
    );

    expect(page.candidates).toEqual([
      { id: 'm-1', fileUrl: '/p1.jpg', thumbnailUrl: '/p1-t.jpg' },
      { id: 'm-4', fileUrl: '/p4.png', thumbnailUrl: null },
    ]);
    expect([page.total, page.hasMore]).toEqual([3, false]);
  });

  test('vise GET …/profile-image-candidates, paginé', async () => {
    const { transport, appels } = transportScenarise(() => ({
      ok: true,
      data: [{ id: 'm-1', fileUrl: '/p1.jpg' }],
      pagination: { total: 1, hasMore: false },
    }));

    const resultat = await loadAdminProfileImageCandidates({ ...deps(transport), userId: 'u-1', offset: 0 });

    expect(appels[0]?.path).toBe('/api/v1/admin/users/u-1/profile-image-candidates?offset=0&limit=30');
    expect(resultat.ok && resultat.data.candidates.map((c) => c.id)).toEqual(['m-1']);
  });
});
