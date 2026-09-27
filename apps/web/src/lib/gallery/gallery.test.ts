import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { CoqueNative } from '@/lib/native-shell';

import {
  GALLERY_REGISTRY_CAPACITY,
  createGalleryAutoSave,
  createGalleryRegistry,
  galleryAutoSaveEnabled,
  galleryCandidates,
  setGalleryAutoSaveEnabled,
  type GalleryStorage,
} from './auto-save';
import { saveToGallery } from './save-to-gallery';
import { GALLERY_ALBUM, NULL_GALLERY_SAVER, galleryHostOf, shellGallerySaver, type GallerySaver } from './gallery-saver';

/**
 * **LES MÉDIAS REÇUS S'ENREGISTRENT SEULS, UNE SEULE FOIS, DANS L'ALBUM MEESHY**
 * (#8308) — coque Android seulement. Le plugin natif est bouchonné : ces témoins
 * font décider les modules — quelle pièce part, combien de fois, et ce qui n'a
 * JAMAIS le droit de partir.
 */

const VIEWER = 'viewer-1';

function memoryStorage(seed: Record<string, string> = {}): GalleryStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const brokenStorage: GalleryStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

type RawAttachment = Record<string, unknown>;

const image = (over: RawAttachment = {}): RawAttachment => ({ id: 'att-img', fileUrl: '/u/a.jpg', mimeType: 'image/jpeg', originalName: 'a.jpg', ...over });
const video = (over: RawAttachment = {}): RawAttachment => ({ id: 'att-vid', fileUrl: '/u/b.mp4', mimeType: 'video/mp4', originalName: 'b.mp4', ...over });

const message = (over: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  conversationId: 'conv-1',
  senderId: 'peer-participant',
  sender: { userId: 'peer-user' },
  attachments: [image()],
  ...over,
});

describe('la garde — quelles pièces partent', () => {
  test('une image et une vidéo reçues d’un pair partent', () => {
    expect(galleryCandidates(message({ attachments: [image(), video()] }), VIEWER).map((a) => a.id)).toEqual(['att-img', 'att-vid']);
  });

  test('un audio, un document ou une pièce sans fichier ne partent jamais', () => {
    const attachments = [
      { id: 'a', fileUrl: '/u/a.m4a', mimeType: 'audio/mp4' },
      { id: 'd', fileUrl: '/u/d.pdf', mimeType: 'application/pdf' },
      image({ id: 'vide', fileUrl: '' }),
      'pas un objet',
    ];
    expect(galleryCandidates(message({ attachments }), VIEWER)).toEqual([]);
  });

  test('mes propres médias ne partent jamais — par participant, par compte, ou par l’écho de mon envoi', () => {
    expect(galleryCandidates(message({ senderId: VIEWER }), VIEWER)).toEqual([]);
    expect(galleryCandidates(message({ sender: { userId: VIEWER } }), VIEWER)).toEqual([]);
    expect(galleryCandidates(message({ clientMessageId: 'cid_1' }), VIEWER)).toEqual([]);
  });

  test('sans lecteur connu, rien ne part', () => {
    expect(galleryCandidates(message(), '')).toEqual([]);
  });

  const protectedMessages: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['vue unique', { isViewOnce: true }],
    ['flou', { isBlurred: true }],
    ['chiffré', { isEncrypted: true }],
    ['échéance', { expiresAt: '2026-09-28T00:00:00.000Z' }],
    ['durée éphémère', { ephemeralDuration: 30 }],
    ['drapeau éphémère', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL }],
    ['drapeau flou', { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }],
    ['drapeau vue unique', { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }],
    ['drapeau éphémère après lecture', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ }],
  ];
  for (const [name, over] of protectedMessages) {
    test(`un message protégé (${name}) ne laisse partir aucune pièce`, () => {
      expect(galleryCandidates(message(over), VIEWER)).toEqual([]);
    });
  }

  test('un effet d’apparence seul (confettis) ne protège rien', () => {
    expect(galleryCandidates(message({ effectFlags: MESSAGE_EFFECT_FLAGS.CONFETTI }), VIEWER)).toHaveLength(1);
  });

  const protectedAttachments: ReadonlyArray<readonly [string, RawAttachment]> = [
    ['vue unique', { isViewOnce: true }],
    ['floutée', { isBlurred: true }],
    ['chiffrée', { isEncrypted: true }],
    ['iv de chiffrement', { encryptionIv: 'iv' }],
    ['drapeau éphémère', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL }],
    ['drapeau vue unique', { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }],
  ];
  for (const [name, over] of protectedAttachments) {
    test(`une pièce protégée (${name}) reste, sa voisine libre part`, () => {
      const ids = galleryCandidates(message({ attachments: [image(over), video()] }), VIEWER).map((a) => a.id);
      expect(ids).toEqual(['att-vid']);
    });
  }
});

describe('le registre — une seule fois par pièce', () => {
  test('une pièce notée survit au rechargement (même stockage, nouveau registre)', () => {
    const storage = memoryStorage();
    createGalleryRegistry({ storage, readerId: VIEWER }).mark('att-1');
    expect(createGalleryRegistry({ storage, readerId: VIEWER }).has('att-1')).toBe(true);
  });

  test('la clé est préfixée par le lecteur — un autre compte ne voit rien', () => {
    const storage = memoryStorage();
    createGalleryRegistry({ storage, readerId: VIEWER }).mark('att-1');
    expect(createGalleryRegistry({ storage, readerId: 'autre' }).has('att-1')).toBe(false);
    expect([...storage.data.keys()].every((key) => key.includes(VIEWER))).toBe(true);
  });

  test('borné : la plus ancienne sort au-delà du plafond', () => {
    const storage = memoryStorage();
    const registry = createGalleryRegistry({ storage, readerId: VIEWER });
    Array.from({ length: GALLERY_REGISTRY_CAPACITY + 1 }, (_, i) => registry.mark(`att-${i}`));
    const reloaded = createGalleryRegistry({ storage, readerId: VIEWER });
    expect(reloaded.has('att-0')).toBe(false);
    expect(reloaded.has(`att-${GALLERY_REGISTRY_CAPACITY}`)).toBe(true);
    const stored = JSON.parse(storage.data.get([...storage.data.keys()][0] ?? '') ?? '[]') as unknown[];
    expect(stored).toHaveLength(GALLERY_REGISTRY_CAPACITY);
  });

  test('un stockage illisible ou corrompu ne jette jamais', () => {
    expect(() => createGalleryRegistry({ storage: brokenStorage, readerId: VIEWER }).mark('x')).not.toThrow();
    const corrupt = memoryStorage({ [`meeshy.gallery.saved.${VIEWER}`]: '{pas du json' });
    expect(createGalleryRegistry({ storage: corrupt, readerId: VIEWER }).has('x')).toBe(false);
  });
});

describe('l’interrupteur des réglages médias', () => {
  test('actif par défaut, et il se retient', () => {
    const storage = memoryStorage();
    expect(galleryAutoSaveEnabled(storage)).toBe(true);
    setGalleryAutoSaveEnabled(storage, false);
    expect(galleryAutoSaveEnabled(storage)).toBe(false);
    setGalleryAutoSaveEnabled(storage, true);
    expect(galleryAutoSaveEnabled(storage)).toBe(true);
  });

  test('un stockage illisible laisse l’interrupteur à sa valeur par défaut', () => {
    expect(galleryAutoSaveEnabled(brokenStorage)).toBe(true);
    expect(() => setGalleryAutoSaveEnabled(brokenStorage, false)).not.toThrow();
  });
});

function fakeSaver(outcome: 'saved' | 'failed' = 'saved') {
  const saved: string[] = [];
  const saver: GallerySaver = {
    available: true,
    save: async ({ fileName }) => {
      saved.push(fileName);
      return outcome;
    },
  };
  return { saver, saved };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function autoSave(options: { readonly android?: boolean; readonly enabled?: boolean; readonly saver?: GallerySaver; readonly storage?: GalleryStorage } = {}) {
  const storage = options.storage ?? memoryStorage();
  if (options.enabled === false) setGalleryAutoSaveEnabled(storage, false);
  const fetched: string[] = [];
  const run = createGalleryAutoSave({
    isAndroidShell: () => options.android ?? true,
    saver: () => options.saver ?? NULL_GALLERY_SAVER,
    storage: () => storage,
    fetchBlob: async (attachment) => {
      fetched.push(attachment.id);
      return new Blob(['x'], { type: attachment.mimeType });
    },
  });
  return { run, fetched, storage };
}

describe('la décision à la réception', () => {
  test('sur la coque Android, une image reçue part UNE fois dans la galerie', async () => {
    const { saver, saved } = fakeSaver();
    const { run } = autoSave({ saver });
    run(message(), VIEWER);
    await flush();
    run(message(), VIEWER);
    await flush();
    expect(saved).toEqual(['a.jpg']);
  });

  test('deux échos simultanés du même message ne l’enregistrent qu’une fois', async () => {
    const { saver, saved } = fakeSaver();
    const { run } = autoSave({ saver });
    run(message(), VIEWER);
    run(message(), VIEWER);
    await flush();
    expect(saved).toEqual(['a.jpg']);
  });

  test('un échec d’enregistrement ne marque pas la pièce — la suivante réception réessaie', async () => {
    const { saver } = fakeSaver('failed');
    const storage = memoryStorage();
    const { run } = autoSave({ saver, storage });
    run(message(), VIEWER);
    await flush();
    expect(createGalleryRegistry({ storage, readerId: VIEWER }).has('att-img')).toBe(false);
  });

  test('interrupteur coupé ⇒ rien n’est ni téléchargé ni enregistré', async () => {
    const { saver, saved } = fakeSaver();
    const { run, fetched } = autoSave({ saver, enabled: false });
    run(message(), VIEWER);
    await flush();
    expect(fetched).toEqual([]);
    expect(saved).toEqual([]);
  });

  test('navigateur ⇒ rien', async () => {
    const { saver, saved } = fakeSaver();
    const { run, fetched } = autoSave({ saver, android: false });
    run(message(), VIEWER);
    await flush();
    expect(fetched).toEqual([]);
    expect(saved).toEqual([]);
  });

  test('coque sans plugin de galerie ⇒ rien n’est téléchargé', async () => {
    const { run, fetched } = autoSave({ saver: NULL_GALLERY_SAVER });
    run(message(), VIEWER);
    await flush();
    expect(fetched).toEqual([]);
  });

  test('un média protégé ou le mien n’est jamais téléchargé', async () => {
    const { saver, saved } = fakeSaver();
    const { run, fetched } = autoSave({ saver });
    run(message({ isViewOnce: true }), VIEWER);
    run(message({ senderId: VIEWER }), VIEWER);
    await flush();
    expect(fetched).toEqual([]);
    expect(saved).toEqual([]);
  });
});

type NativeCall = { readonly methode: string; readonly options: Record<string, unknown> };

function fakeShell(options: { readonly platform?: string; readonly withMedia?: boolean; readonly albums?: ReadonlyArray<{ name: string; identifier: string }> } = {}) {
  const calls: NativeCall[] = [];
  const albums = [...(options.albums ?? [])];
  const shell: CoqueNative = {
    getPlatform: () => options.platform ?? 'android',
    PluginHeaders:
      options.withMedia === false
        ? [{ name: 'PushNotifications', methods: [] }]
        : [{ name: 'Media', methods: ['getAlbums', 'createAlbum', 'savePhoto', 'saveVideo'].map((name) => ({ name })) }],
    nativePromise: async (_plugin, methode, opts) => {
      calls.push({ methode, options: opts as Record<string, unknown> });
      if (methode === 'getAlbums') return { albums };
      if (methode === 'createAlbum') {
        albums.push({ name: String((opts as { name: string }).name), identifier: '/storage/Pictures/Meeshy' });
        return {};
      }
      return { filePath: '/storage/Pictures/Meeshy/a.jpg' };
    },
  };
  return { shell, calls };
}

describe('le saver de la coque — plugin Media optionnel', () => {
  test('sans plugin enregistré, le saver est nul et ne fait rien', async () => {
    const { shell } = fakeShell({ withMedia: false });
    const saver = shellGallerySaver(shell);
    expect(saver.available).toBe(false);
    expect(await saver.save({ blob: new Blob(['x']), fileName: 'a.jpg', mimeType: 'image/jpeg' })).toBe('unavailable');
  });

  test('une image crée l’album Meeshy s’il manque, puis s’y enregistre', async () => {
    const { shell, calls } = fakeShell();
    const saver = shellGallerySaver(shell);
    expect(await saver.save({ blob: new Blob(['x'], { type: 'image/jpeg' }), fileName: 'a.jpg', mimeType: 'image/jpeg' })).toBe('saved');
    expect(calls.map((c) => c.methode)).toEqual(['getAlbums', 'createAlbum', 'getAlbums', 'savePhoto']);
    expect(calls[1]?.options).toEqual({ name: GALLERY_ALBUM });
    const save = calls[3]?.options ?? {};
    expect(save.albumIdentifier).toBe('/storage/Pictures/Meeshy');
    expect(String(save.path).startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  test('une vidéo va par saveVideo dans l’album existant, qui n’est lu qu’une fois', async () => {
    const { shell, calls } = fakeShell({ albums: [{ name: GALLERY_ALBUM, identifier: '/p/Meeshy' }] });
    const saver = shellGallerySaver(shell);
    await saver.save({ blob: new Blob(['x']), fileName: 'b.mp4', mimeType: 'video/mp4' });
    await saver.save({ blob: new Blob(['y']), fileName: 'c.mp4', mimeType: 'video/mp4' });
    expect(calls.map((c) => c.methode)).toEqual(['getAlbums', 'saveVideo', 'saveVideo']);
  });

  test('un type qui n’est ni image ni vidéo n’est pas enregistré', async () => {
    const { shell, calls } = fakeShell();
    expect(await shellGallerySaver(shell).save({ blob: new Blob(['x']), fileName: 'a.pdf', mimeType: 'application/pdf' })).toBe('unavailable');
    expect(calls).toEqual([]);
  });

  test('un rejet natif rend « failed », jamais une exception', async () => {
    const shell: CoqueNative = {
      getPlatform: () => 'android',
      PluginHeaders: [{ name: 'Media', methods: ['getAlbums', 'createAlbum', 'savePhoto', 'saveVideo'].map((name) => ({ name })) }],
      nativePromise: async () => {
        throw new Error('denied');
      },
    };
    expect(await shellGallerySaver(shell).save({ blob: new Blob(['x']), fileName: 'a.jpg', mimeType: 'image/jpeg' })).toBe('failed');
  });

  test('l’hôte : Android natif seulement — navigateur et iOS n’ont pas de saver', () => {
    expect(galleryHostOf(undefined)).toBeNull();
    expect(galleryHostOf(fakeShell({ platform: 'web' }).shell)).toBeNull();
    expect(galleryHostOf(fakeShell({ platform: 'ios' }).shell)).toBeNull();
    expect(galleryHostOf(fakeShell({ withMedia: false }).shell)).toBeNull();
    expect(galleryHostOf(fakeShell().shell)?.available).toBe(true);
  });
});

describe('« Enregistrer » dans la visionneuse', () => {
  const input = { blob: new Blob(['x']), fileName: 'a.jpg', mimeType: 'image/jpeg' };

  test('navigateur (aucun saver) ⇒ la visionneuse garde son téléchargement', async () => {
    expect(await saveToGallery({ saver: null, ...input })).toBeNull();
  });

  test('coque Android ⇒ l’image part droit dans l’album, sans feuille ni dialogue', async () => {
    const { saver, saved } = fakeSaver();
    expect(await saveToGallery({ saver, ...input })).toBe('media.viewer.saved');
    expect(saved).toEqual(['a.jpg']);
  });

  test('un refus du plugin se dit en échec', async () => {
    const { saver } = fakeSaver('failed');
    expect(await saveToGallery({ saver, ...input })).toBe('media.viewer.save_failed');
  });

  test('un document n’est pas un média de galerie ⇒ la voie actuelle reste', async () => {
    const { saver, saved } = fakeSaver();
    expect(await saveToGallery({ saver, ...input, mimeType: 'application/pdf' })).toBeNull();
    expect(saved).toEqual([]);
  });
});
