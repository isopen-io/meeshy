import {
  countStaticUploadUrls,
  isStaticUploadUrl,
} from '../../../services/attachments/staticUploadUrlCount';
import type { MediaUrlRow } from '../../../services/attachments/mediaUrlNormalization';

/**
 * LE COMPTE QUI PRÉCÈDE LE RETRAIT DU MONTAGE (#11256).
 *
 * Fermer `static.<domaine>/uploads` casse toute ligne qui GRAVE cette adresse
 * dans sa colonne. Ces lignes seraient une MIGRATION DE DONNÉES (feu vert du
 * porteur, #9223) : on les compte avant de retirer, on ne devine pas.
 */
describe('isStaticUploadUrl — #11256', () => {
  test.each([
    'https://static.meeshy.me/uploads/2026/09/68f33afa/photo.jpg',
    'https://static.staging.meeshy.me/uploads/2026/09/68f33afa/photo.jpg',
    'http://static.meeshy.local/uploads/2026/09/68f33afa/photo.jpg',
    'https://static.meeshy.me/uploads/2026/09/68f33afa/photo%20x.jpg?v=2',
  ])('%s est une adresse du domaine statique', (value) => {
    expect(isStaticUploadUrl(value)).toBe(true);
  });

  test.each([
    ['la route de la passerelle', 'https://gate.meeshy.me/api/v1/attachments/file/2026/09/68f33afa/photo.jpg'],
    ['une route relative', '/api/attachments/file/2026%2F09%2F68f33afa%2Fphoto.jpg'],
    ['la clé de stockage nue', '2026/09/68f33afa/photo.jpg'],
    ['le magasin legacy /u/, qui reste servi', 'https://static.meeshy.me/u/i/2025/11/avatar.jpg'],
    ['un hôte qui n’est pas static.*', 'https://cdn.example.com/uploads/2026/09/a/photo.jpg'],
    ['un hôte qui contient "static" sans en être le sous-domaine', 'https://notstatic.meeshy.me/uploads/2026/09/a/photo.jpg'],
    ['/uploads en milieu de chemin', 'https://static.meeshy.me/u/uploads/2026/09/a/photo.jpg'],
    ['une chaîne vide', ''],
    ['une adresse illisible', 'https://static.meeshy.me:abc/uploads/x'],
  ])('%s n’en est pas une', (_nom, value) => {
    expect(isStaticUploadUrl(value)).toBe(false);
  });
});

describe('countStaticUploadUrls — #11256', () => {
  const STATIQUE = 'https://static.meeshy.me/uploads/2026/09/68f33afa/photo.jpg';
  const VIGNETTE = 'https://static.meeshy.me/uploads/2026/09/68f33afa/photo_thumb.jpg';
  const PASSERELLE = 'https://gate.meeshy.me/api/v1/attachments/file/2026/09/68f33afa/photo.jpg';

  function fakeStore(name: string, rows: readonly MediaUrlRow[]) {
    const pages = new Map<string | null, readonly MediaUrlRow[]>([
      [null, rows],
      [rows.at(-1)?.id ?? null, []],
    ]);
    const lectures: Array<string | null> = [];
    return {
      name,
      lectures,
      list: async (cursor: string | null): Promise<readonly MediaUrlRow[]> => {
        lectures.push(cursor);
        return pages.get(cursor) ?? [];
      },
    };
  }

  test('compte fileUrl ET thumbnailUrl, par collection', async () => {
    const attachments = fakeStore('MessageAttachment', [
      { id: 'a', fileUrl: STATIQUE, thumbnailUrl: VIGNETTE },
      { id: 'b', fileUrl: PASSERELLE, thumbnailUrl: STATIQUE },
      { id: 'c', fileUrl: '2026/09/x/y.jpg', thumbnailUrl: null },
    ]);
    const posts = fakeStore('PostMedia', [{ id: 'd', fileUrl: PASSERELLE, thumbnailUrl: null }]);

    const report = await countStaticUploadUrls({ stores: [attachments, posts] });

    expect(report.total).toBe(3);
    expect(report.parCollection['MessageAttachment']).toEqual({ scanned: 3, fileUrl: 1, thumbnailUrl: 2 });
    expect(report.parCollection['PostMedia']).toEqual({ scanned: 1, fileUrl: 0, thumbnailUrl: 0 });
  });

  test('base propre : le total est zéro, le retrait peut suivre', async () => {
    const report = await countStaticUploadUrls({
      stores: [fakeStore('MessageAttachment', [{ id: 'a', fileUrl: PASSERELLE, thumbnailUrl: null }])],
    });

    expect(report.total).toBe(0);
    expect(report.exemples).toEqual([]);
  });

  test('les exemples sont bornés et nomment collection, colonne et ligne', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: `id${i}`, fileUrl: STATIQUE, thumbnailUrl: null }));

    const report = await countStaticUploadUrls({ stores: [fakeStore('PostMedia', rows)] });

    expect(report.total).toBe(40);
    expect(report.exemples).toHaveLength(12);
    expect(report.exemples[0]).toBe(`PostMedia.fileUrl  id0  ${STATIQUE}`);
  });

  test('le compte pagine par curseur jusqu’à une page vide', async () => {
    const store = fakeStore('PostMedia', [{ id: 'z', fileUrl: STATIQUE, thumbnailUrl: null }]);

    await countStaticUploadUrls({ stores: [store] });

    expect(store.lectures).toEqual([null, 'z']);
  });

  test('il ne peut pas ÉCRIRE : le port qu’il reçoit n’a pas de `write`', async () => {
    const store = fakeStore('PostMedia', [{ id: 'a', fileUrl: STATIQUE, thumbnailUrl: null }]);

    await countStaticUploadUrls({ stores: [store] });

    expect(Object.keys(store).sort()).toEqual(['lectures', 'list', 'name']);
  });
});
