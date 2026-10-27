import { describe, expect, test } from 'bun:test';

import { fakeIndexedDb } from '@/lib/share-incoming/idb-double';
import { idbDeviceRecords, memoryDeviceRecords, type DeviceRecords } from '@/lib/send/send-queue';

import { emptyStudioDraft, withAddedPage, withPage, type StudioDraft } from './studio';
import { createStudioOutbox, draftWithOutbox, outboxSlotsOf, type StudioOutboxIntent } from './studio-outbox';
import type { StudioVisualAsset } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';

/**
 * **UNE PUBLICATION NE SE PERD JAMAIS AVANT D'ÊTRE PUBLIÉE** (#13416) — sur le
 * web, les fichiers d'une création vivaient dans la mémoire de l'onglet : un
 * rechargement, une coupure ou un échec les perdait, le brouillon ne gardant
 * que les références serveur des médias déjà montés. Ils vivent désormais sur
 * l'appareil jusqu'à la publication ou jusqu'à leur retrait par l'auteur.
 */

const photo = (name = 'plage.heic', type = 'image/heic') => new File([new Uint8Array([1, 2, 3])], name, { type });

const visual = (file: File, upload: StudioVisualAsset['upload'] = { phase: 'uploading', progress: 0.4 }): StudioVisualAsset => ({
  file,
  previewUrl: `blob:local/${file.name}`,
  mediaType: 'image',
  upload,
  aspectRatio: 0.75,
  caption: 'Au bord de l’eau',
  pose: IDENTITY_POSE,
});

const withoutFile = ({ file: _file, ...asset }: StudioVisualAsset): StudioVisualAsset => asset;

const withBackground = (draft: StudioDraft, pageId: string, asset: StudioVisualAsset): StudioDraft => withPage(draft, pageId, (page) => ({ ...page, background: asset }));

const intent: StudioOutboxIntent = { choice: { kind: 'POST', layout: null }, promoted: false, state: 'armed', keys: [] };

let urls = 0;
const makeUrl = () => `blob:restored/${(urls += 1)}`;

describe('les médias d’une création se retrouvent après un rechargement', () => {
  test('un média qui montait revient sur sa page, avec sa légende, et REPART', () => {
    const file = photo();
    const before = withBackground(emptyStudioDraft('fr'), 'page-1', visual(file));
    const restored = draftWithOutbox(emptyStudioDraft('fr'), outboxSlotsOf(before), { makeUrl, language: 'fr' });
    const background = restored.pages[0]!.background!;
    expect(background.file).toBe(file);
    expect(background.caption).toBe('Au bord de l’eau');
    expect(background.aspectRatio).toBe(0.75);
    expect(background.previewUrl.startsWith('blob:restored/')).toBe(true);
    expect(background.upload).toEqual({ phase: 'uploading', progress: 0 });
  });

  test('un média déjà monté garde sa référence serveur et retrouve son fichier local', () => {
    const file = photo('mer.jpg', 'image/jpeg');
    const ready = { phase: 'ready', postMediaId: 'pm-1', fileUrl: '2026/10/u/mer.jpg' } as const;
    const before = withBackground(emptyStudioDraft('fr'), 'page-1', visual(file, ready));
    const fromSnapshot = withBackground(emptyStudioDraft('fr'), 'page-1', withoutFile({ ...visual(file, ready), previewUrl: 'https://gate/mer.jpg' }));
    const restored = draftWithOutbox(fromSnapshot, outboxSlotsOf(before), { makeUrl, language: 'fr' });
    expect(restored.pages[0]!.background!.upload).toEqual(ready);
    expect(restored.pages[0]!.background!.file).toBe(file);
  });

  test('une page que le brouillon n’a pas gardée revient, après celles qu’il a', () => {
    const written = withPage(emptyStudioDraft('fr'), 'page-1', (page) => ({ ...page, texts: [{ ...page.texts[0]!, text: 'Bonjour' }] }));
    const twoPages = withAddedPage(written, 'fr');
    const second = twoPages.pages[1]!.id;
    const before = withBackground(twoPages, second, visual(photo()));
    const restored = draftWithOutbox(written, outboxSlotsOf(before), { makeUrl, language: 'fr' });
    expect(restored.pages.map((page) => page.id)).toEqual(['page-1', second]);
    expect(restored.pages[1]!.background?.file).toBeDefined();
    expect(new Set(restored.pages.flatMap((page) => page.texts.map((layer) => layer.id))).size).toBe(2);
  });

  test('un brouillon effacé (il ne portait qu’un média non monté) revient sans page blanche devant', () => {
    const twoPages = withAddedPage(emptyStudioDraft('fr'), 'fr');
    const second = twoPages.pages[1]!.id;
    const restored = draftWithOutbox(emptyStudioDraft('fr'), outboxSlotsOf(withBackground(twoPages, second, visual(photo()))), { makeUrl, language: 'fr' });
    expect(restored.pages.map((page) => page.id)).toEqual([second]);
    expect(restored.currentPage).toBe(second);
  });

  test('un emplacement que le brouillon a REMPLI d’un autre média reste à ce média', () => {
    const before = withBackground(emptyStudioDraft('fr'), 'page-1', visual(photo('ancien.jpg', 'image/jpeg')));
    const other = { phase: 'ready', postMediaId: 'pm-9', fileUrl: '2026/10/u/autre.jpg' } as const;
    const current = withBackground(emptyStudioDraft('fr'), 'page-1', withoutFile(visual(photo('autre.jpg', 'image/jpeg'), other)));
    const restored = draftWithOutbox(current, outboxSlotsOf(before), { makeUrl, language: 'fr' });
    expect(restored.pages[0]!.background!.upload).toEqual(other);
    expect(restored.pages[0]!.background!.file).toBeUndefined();
  });
});

describe('le magasin de l’appareil', () => {
  const draftWithPhoto = (file: File) => withBackground(emptyStudioDraft('fr'), 'page-1', visual(file));

  test('ce qui est écrit se relit, intention de publier comprise — par compte', async () => {
    const records = memoryDeviceRecords();
    const outbox = createStudioOutbox(records);
    const file = photo();
    expect(await outbox.save('ana', { slots: outboxSlotsOf(draftWithPhoto(file)), intent })).toBe(true);
    const reread = await createStudioOutbox(records).load('ana');
    expect(reread?.slots[0]?.file).toBe(file);
    expect(reread?.intent).toEqual(intent);
    expect(await createStudioOutbox(records).load('ben')).toBeNull();
  });

  test('effacé à la publication ou par l’auteur — rien ne reste', async () => {
    const records = memoryDeviceRecords();
    const outbox = createStudioOutbox(records);
    await outbox.save('ana', { slots: outboxSlotsOf(draftWithPhoto(photo())), intent });
    await outbox.clear('ana');
    expect(await createStudioOutbox(records).load('ana')).toBeNull();
  });

  test('une légende retouchée ne réécrit pas les fichiers', async () => {
    const writes: string[] = [];
    const inner = memoryDeviceRecords();
    const records: DeviceRecords = { load: inner.load, save: (key, value) => (writes.push(key), inner.save(key, value)) };
    const outbox = createStudioOutbox(records);
    const draft = draftWithPhoto(photo());
    await outbox.save('ana', { slots: outboxSlotsOf(draft), intent: null });
    writes.length = 0;
    const retouched = withPage(draft, 'page-1', (page) => ({ ...page, background: { ...page.background!, caption: 'Autre légende' } }));
    await outbox.save('ana', { slots: outboxSlotsOf(retouched), intent: null });
    expect(writes.every((key) => !key.endsWith('.files'))).toBe(true);
    expect(writes.length).toBe(1);
  });

  test('IndexedDB, la base des envois : un rechargement relit les fichiers', async () => {
    const db = fakeIndexedDb();
    const file = photo();
    await createStudioOutbox(idbDeviceRecords(db.factory)).save('ana', { slots: outboxSlotsOf(draftWithPhoto(file)), intent });
    const reread = await createStudioOutbox(idbDeviceRecords(db.factory)).load('ana');
    expect(reread?.slots[0]?.file).toBe(file);
  });

  test('un appareil qui refuse (navigation privée, quota) : jamais une exception, et il le DIT', async () => {
    const broken: DeviceRecords = { load: () => Promise.reject(new Error('privé')), save: () => Promise.reject(new DOMException('plein', 'QuotaExceededError')) };
    const outbox = createStudioOutbox(broken);
    expect(await outbox.load('ana')).toBeNull();
    expect(await outbox.save('ana', { slots: outboxSlotsOf(draftWithPhoto(photo())), intent })).toBe(false);
    expect(await outbox.clear('ana')).toBe(false);
  });

  test('une entrée abîmée est écartée sans faire tomber les autres', async () => {
    const records = memoryDeviceRecords();
    const file = photo();
    await createStudioOutbox(records).save('ana', { slots: outboxSlotsOf(draftWithPhoto(file)), intent });
    await records.save('studio-outbox.ana.meta', { slots: [{ pageId: 'page-1', door: 'visual', meta: { mediaType: 'image' } }, { pageId: 3 }], intent: { state: 'n’importe' } });
    const reread = await createStudioOutbox(records).load('ana');
    expect(reread?.slots).toHaveLength(1);
    expect(reread?.intent).toBeNull();
  });
});
