import {
  countStaticUploadUrls,
  isStaticUploadUrl,
  type StaticUploadUrlRow,
  type StaticUploadUrlStore,
} from '../../../services/attachments/staticUploadUrlCount';
import { STATIC_UPLOAD_URL_COLUMNS } from '../../../services/attachments/staticUploadUrlStores';

/**
 * LE COMPTE QUI PRÉCÈDE LE RETRAIT DU MONTAGE (#11256).
 *
 * Fermer `static.<domaine>/uploads` casse toute ligne qui GRAVE cette adresse
 * dans une colonne — pièce jointe, vignette, mais aussi avatar, bannière ou
 * piste d'un post. Ces lignes seraient une MIGRATION DE DONNÉES (feu vert du
 * porteur, #9223) : on les compte avant de retirer, on ne devine pas.
 */
describe('isStaticUploadUrl — #11256', () => {
  test.each([
    'https://static.meeshy.me/uploads/2026/09/68f33afa/photo.jpg',
    'https://static.staging.meeshy.me/uploads/2026/09/68f33afa/photo.jpg',
    'http://static.meeshy.local/uploads/2026/09/68f33afa/photo.jpg',
    'https://static.meeshy.me/uploads/2026/09/68f33afa/photo%20x.jpg?v=2',
    'HTTPS://STATIC.MEESHY.ME/uploads/2026/09/68f33afa/photo.jpg',
    '//static.meeshy.me/uploads/2026/09/68f33afa/photo.jpg',
    'static:uploads/2026/09/68f33afa/photo.jpg',
    'static:/uploads/2026/09/68f33afa/photo.jpg',
  ])('%s est une adresse du domaine statique', (value) => {
    expect(isStaticUploadUrl(value)).toBe(true);
  });

  test.each([
    ['la route de la passerelle', 'https://gate.meeshy.me/api/v1/attachments/file/2026/09/68f33afa/photo.jpg'],
    ['une route relative', '/api/attachments/file/2026%2F09%2F68f33afa%2Fphoto.jpg'],
    ['un chemin relatif /uploads, résolu sur la passerelle', '/uploads/2026/09/a/photo.jpg'],
    ['la clé de stockage nue', '2026/09/68f33afa/photo.jpg'],
    ['le magasin legacy /u/, qui reste servi', 'https://static.meeshy.me/u/i/2025/11/avatar.jpg'],
    ['la référence déclarée du magasin legacy', 'static:u/i/2025/11/avatar.jpg'],
    ['une référence statique dont le chemin ne COMMENCE pas par uploads/', 'static:u/uploads/2026/09/a/photo.jpg'],
    ['un hôte qui n’est pas static.*', 'https://cdn.example.com/uploads/2026/09/a/photo.jpg'],
    ['un hôte qui contient "static" sans en être le sous-domaine', 'https://notstatic.meeshy.me/uploads/2026/09/a/photo.jpg'],
    ['/uploads en milieu de chemin', 'https://static.meeshy.me/u/uploads/2026/09/a/photo.jpg'],
    ['un autre schéma', 'ftp://static.meeshy.me/uploads/2026/09/a/photo.jpg'],
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

  function fakeStore(name: string, fields: readonly string[], rows: readonly StaticUploadUrlRow[]) {
    const pages = new Map<string | null, readonly StaticUploadUrlRow[]>([
      [null, rows],
      [rows.at(-1)?.id ?? null, []],
    ]);
    const lectures: Array<string | null> = [];
    const store: StaticUploadUrlStore = {
      name,
      fields,
      list: async (cursor) => {
        lectures.push(cursor);
        return pages.get(cursor) ?? [];
      },
    };
    return { store, lectures };
  }

  const ligne = (id: string, values: Readonly<Record<string, string | null>>): StaticUploadUrlRow => ({ id, values });

  test('compte chaque colonne déclarée, par collection', async () => {
    const attachments = fakeStore('MessageAttachment', ['fileUrl', 'thumbnailUrl'], [
      ligne('a', { fileUrl: STATIQUE, thumbnailUrl: VIGNETTE }),
      ligne('b', { fileUrl: PASSERELLE, thumbnailUrl: STATIQUE }),
      ligne('c', { fileUrl: '2026/09/x/y.jpg', thumbnailUrl: null }),
    ]);
    const users = fakeStore('User', ['avatar', 'banner'], [
      ligne('u1', { avatar: STATIQUE, banner: null }),
      ligne('u2', { avatar: 'https://static.meeshy.me/u/i/2025/11/a.jpg', banner: PASSERELLE }),
    ]);

    const report = await countStaticUploadUrls({ stores: [attachments.store, users.store] });

    expect(report.total).toBe(4);
    expect(report.parCollection['MessageAttachment']).toEqual({ scanned: 3, parColonne: { fileUrl: 1, thumbnailUrl: 2 } });
    expect(report.parCollection['User']).toEqual({ scanned: 2, parColonne: { avatar: 1, banner: 0 } });
  });

  test('une colonne déclarée mais absente de la ligne compte zéro, sans lever', async () => {
    const { store } = fakeStore('Post', ['audioUrl'], [ligne('p', {})]);

    const report = await countStaticUploadUrls({ stores: [store] });

    expect(report.parCollection['Post']).toEqual({ scanned: 1, parColonne: { audioUrl: 0 } });
  });

  test('base propre : le total est zéro, le retrait peut suivre', async () => {
    const { store } = fakeStore('MessageAttachment', ['fileUrl'], [ligne('a', { fileUrl: PASSERELLE })]);

    const report = await countStaticUploadUrls({ stores: [store] });

    expect(report.total).toBe(0);
    expect(report.exemples).toEqual([]);
  });

  test('les exemples sont bornés et nomment collection, colonne et ligne', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ligne(`id${i}`, { fileUrl: STATIQUE }));
    const { store } = fakeStore('PostMedia', ['fileUrl'], rows);

    const report = await countStaticUploadUrls({ stores: [store] });

    expect(report.total).toBe(40);
    expect(report.exemples).toHaveLength(12);
    expect(report.exemples[0]).toBe(`PostMedia.fileUrl  id0  ${STATIQUE}`);
  });

  test('le compte pagine par curseur jusqu’à une page vide', async () => {
    const { store, lectures } = fakeStore('PostMedia', ['fileUrl'], [ligne('z', { fileUrl: STATIQUE })]);

    await countStaticUploadUrls({ stores: [store] });

    expect(lectures).toEqual([null, 'z']);
  });

  test('il n’écrit RIEN, même quand le port qu’on lui remet sait écrire', async () => {
    const { store } = fakeStore('PostMedia', ['fileUrl'], [ligne('a', { fileUrl: STATIQUE })]);
    const write = jest.fn();
    const storeQuiEcrit = { ...store, write };

    await countStaticUploadUrls({ stores: [storeQuiEcrit] });

    expect(write).not.toHaveBeenCalled();
  });
});

describe('STATIC_UPLOAD_URL_COLUMNS — les colonnes balayées (#11256)', () => {
  test('couvre toute colonne qui peut graver une adresse de média, pas seulement les pièces jointes', () => {
    expect(STATIC_UPLOAD_URL_COLUMNS).toEqual({
      MessageAttachment: ['fileUrl', 'thumbnailUrl'],
      PostMedia: ['fileUrl', 'thumbnailUrl'],
      Post: ['audioUrl'],
      User: ['avatar', 'banner'],
      Conversation: ['avatar', 'banner'],
      Participant: ['avatar'],
      Community: ['avatar', 'banner'],
      Sound: ['fileUrl', 'coverUrl'],
    });
  });
});
