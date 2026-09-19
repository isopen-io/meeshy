import { MediaService } from '../../../services/MediaService';
import { sweepMediaUrls, type MediaUrlRow, type MediaUrlStore } from '../../../services/attachments/mediaUrlNormalization';

/**
 * LE BALAYAGE (#7022) — ce qui LIT les lignes et ce qui ÉCRIT, séparés de la
 * décision que `mediaUrlNormalization.test.ts` interroge.
 *
 * IL NE PARLE PAS À PRISMA : il reçoit un `MediaUrlStore`, un port à trois
 * méthodes. Ce n'est pas du purisme — un faux Prisma accepte N'IMPORTE QUELLE
 * forme de requête, donc un témoin écrit contre lui verdit sur un `select` qui
 * ne compile pas. Avec un port étroit, le témoin mesure le BALAYAGE, et `tsc`
 * juge les deux vraies requêtes. Chacun juge ce qu'il sait juger.
 *
 * ENCORE FAUT-IL QUE `tsc` LES LISE. Cette phrase a d'abord désigné le SCRIPT
 * comme le lieu des requêtes, ce qui la rendait fausse : `tsconfig.json`
 * n'inclut que `src/**` et `shared/**`, donc aucun des vingt fichiers de
 * `scripts/` n'entre dans le programme (`tsc --listFiles | grep -c
 * normalize-media-urls` rend `0`). Les deux `select` n'étaient jugés par
 * personne. Ils vivent depuis sous `src/services/attachments/mediaUrlStores.ts`
 * — dans le programme que la CI joue en BLOQUANT — et leur pagination a son
 * témoin (`mediaUrlStores.test.ts`).
 */
describe('sweepMediaUrls — #7022', () => {
  const storageKeyOf = (value: string) => new MediaService('/app/uploads').relativePathFromUrl(value);

  const ABSOLUE = 'https://gate.meeshy.me/api/v1/attachments/file/2026/02/68f33afa/community_upload.jpg';
  const CLÉ_ABSOLUE = '2026/02/68f33afa/community_upload.jpg';
  const ROUTE = '/api/attachments/file/2025%2F12%2F6908537c%2Fdossier.pdf';
  const CLÉ_ROUTE = '2025/12/6908537c/dossier.pdf';
  const NUE = '2026/09/68f33afa/0_2e0b854d.jpeg';

  function fakeStore(name: string, rows: readonly MediaUrlRow[]): MediaUrlStore & { readonly writes: Map<string, Partial<MediaUrlRow>> } {
    const writes = new Map<string, Partial<MediaUrlRow>>();
    return {
      name,
      writes,
      list: async (cursor: string | null) => (cursor === null ? rows : []),
      write: async (id: string, patch: Readonly<Partial<Record<'fileUrl' | 'thumbnailUrl', string>>>) => {
        writes.set(id, patch);
      },
    };
  }

  const tousPrésents = () => true;

  test('À BLANC (le défaut) : rien n’est écrit, et le compte est rendu', async () => {
    const store = fakeStore('PostMedia', [
      { id: 'a', fileUrl: ABSOLUE, thumbnailUrl: null },
      { id: 'b', fileUrl: ROUTE, thumbnailUrl: null },
      { id: 'c', fileUrl: NUE, thumbnailUrl: null },
    ]);

    const report = await sweepMediaUrls({ stores: [store], apply: false, storageKeyOf, hasBytes: tousPrésents });

    expect(store.writes.size).toBe(0);
    expect(report.scanned).toBe(3);
    expect(report.normalized).toBe(2);
    expect(report.alreadyNormalized).toBe(1);
  });

  test('--apply : chaque ligne reçoit sa CLÉ, et rien d’autre', async () => {
    const store = fakeStore('PostMedia', [
      { id: 'a', fileUrl: ABSOLUE, thumbnailUrl: null },
      { id: 'b', fileUrl: ROUTE, thumbnailUrl: null },
      { id: 'c', fileUrl: NUE, thumbnailUrl: null },
    ]);

    await sweepMediaUrls({ stores: [store], apply: true, storageKeyOf, hasBytes: tousPrésents });

    expect(store.writes.get('a')).toEqual({ fileUrl: CLÉ_ABSOLUE });
    expect(store.writes.get('b')).toEqual({ fileUrl: CLÉ_ROUTE });
    expect(store.writes.has('c')).toBe(false);
  });

  test('LA VIGNETTE est normalisée au même titre — 1184 lignes absolues en base', async () => {
    const store = fakeStore('MessageAttachment', [{ id: 'a', fileUrl: NUE, thumbnailUrl: ABSOLUE }]);

    await sweepMediaUrls({ stores: [store], apply: true, storageKeyOf, hasBytes: tousPrésents });

    expect(store.writes.get('a')).toEqual({ thumbnailUrl: CLÉ_ABSOLUE });
  });

  test('les DEUX colonnes d’une même ligne partent en UNE écriture', async () => {
    const store = fakeStore('MessageAttachment', [{ id: 'a', fileUrl: ABSOLUE, thumbnailUrl: ROUTE }]);

    await sweepMediaUrls({ stores: [store], apply: true, storageKeyOf, hasBytes: tousPrésents });

    expect(store.writes.get('a')).toEqual({ fileUrl: CLÉ_ABSOLUE, thumbnailUrl: CLÉ_ROUTE });
    expect(store.writes.size).toBe(1);
  });

  /**
   * FAIL-CLOSED, ET C'EST LE CŒUR DU SCRIPT. Les 8 fichiers réellement absents
   * de la production (mesurés le 2026-09-18 : 8 sur 2912, et ZÉRO côté
   * PostMedia) ne doivent PAS voir leur adresse réécrite : tant que la ligne
   * porte son adresse d'origine, on sait ce qu'on cherchait. Une clé réécrite
   * sur des octets absents perd cette trace pour toujours.
   */
  test('une ligne dont les OCTETS manquent est laissée INTACTE et comptée', async () => {
    const store = fakeStore('MessageAttachment', [{ id: 'perdu', fileUrl: ABSOLUE, thumbnailUrl: null }]);

    const report = await sweepMediaUrls({ stores: [store], apply: true, storageKeyOf, hasBytes: () => false });

    expect(store.writes.size).toBe(0);
    expect(report.missingBytes).toBe(1);
    expect(report.normalized).toBe(0);
  });

  test('le magasin STATIQUE et les pistes TRADUITES sont comptés séparément, jamais réécrits', async () => {
    const store = fakeStore('MessageAttachment', [
      { id: 's', fileUrl: 'https://static.meeshy.me/u/i/2025/11/avatar.jpg', thumbnailUrl: null },
      { id: 't', fileUrl: '/api/v1/attachments/file/translated/voice_fr_42.mp3', thumbnailUrl: null },
    ]);

    const report = await sweepMediaUrls({ stores: [store], apply: true, storageKeyOf, hasBytes: tousPrésents });

    expect(store.writes.size).toBe(0);
    expect(report.unknownShape).toBe(1);
    expect(report.outsideTree).toBe(1);
  });

  test('IDEMPOTENT — le second passage sur le résultat du premier n’écrit rien', async () => {
    const premier = fakeStore('PostMedia', [{ id: 'a', fileUrl: ABSOLUE, thumbnailUrl: ROUTE }]);
    await sweepMediaUrls({ stores: [premier], apply: true, storageKeyOf, hasBytes: tousPrésents });

    const second = fakeStore('PostMedia', [{ id: 'a', fileUrl: CLÉ_ABSOLUE, thumbnailUrl: CLÉ_ROUTE }]);
    const report = await sweepMediaUrls({ stores: [second], apply: true, storageKeyOf, hasBytes: tousPrésents });

    expect(second.writes.size).toBe(0);
    expect(report.normalized).toBe(0);
    expect(report.alreadyNormalized).toBe(2);
  });

  test('les DEUX collections sont balayées par le même passage', async () => {
    const attachments = fakeStore('MessageAttachment', [{ id: 'a', fileUrl: ABSOLUE, thumbnailUrl: null }]);
    const medias = fakeStore('PostMedia', [{ id: 'b', fileUrl: ROUTE, thumbnailUrl: null }]);

    const report = await sweepMediaUrls({ stores: [attachments, medias], apply: true, storageKeyOf, hasBytes: tousPrésents });

    expect(report.scanned).toBe(2);
    expect(report.normalized).toBe(2);
    expect(report.parCollection['MessageAttachment']?.normalized).toBe(1);
    expect(report.parCollection['PostMedia']?.normalized).toBe(1);
  });

  test('la PAGINATION est suivie jusqu’au bout — un lot ne s’arrête pas à la première page', async () => {
    const pages: Record<string, readonly MediaUrlRow[]> = {
      DÉBUT: [{ id: 'a', fileUrl: ABSOLUE, thumbnailUrl: null }],
      a: [{ id: 'b', fileUrl: ROUTE, thumbnailUrl: null }],
      b: [],
    };
    const writes = new Map<string, Partial<MediaUrlRow>>();
    const store: MediaUrlStore = {
      name: 'MessageAttachment',
      list: async (cursor) => pages[cursor ?? 'DÉBUT'] ?? [],
      write: async (id, patch) => {
        writes.set(id, patch);
      },
    };

    const report = await sweepMediaUrls({ stores: [store], apply: true, storageKeyOf, hasBytes: tousPrésents });

    expect(report.scanned).toBe(2);
    expect(writes.size).toBe(2);
  });
});
