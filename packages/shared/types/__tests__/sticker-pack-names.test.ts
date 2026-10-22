import { describe, it, expect } from 'vitest';
import { PACK_LANGUAGES } from '../content-pack';
import { BUILTIN_STICKER_PACKS, builtinStickerPackNames, stickerPackText } from '../sticker-pack';
import type { StickerPackSummary } from '../sticker-pack';

/**
 * Les noms des packs de stickers INTÉGRÉS se lisent dans la langue de
 * l'interface (#10189) : le catalogue partagé porte les sept langues, et UNE
 * loi — `stickerPackText` — les sert aux clients, avec repli sur `name`.
 */

const thirdParty = (over: Partial<StickerPackSummary> = {}): StickerPackSummary => ({
  slug: 'chats-de-paris',
  name: 'Chats de Paris',
  description: 'Des chats qui flânent sur les quais.',
  author: 'Studio Minou',
  builtin: false,
  status: 'approved',
  itemCount: 3,
  kinds: ['static'],
  coverUrl: null,
  installed: false,
  installCount: 0,
  ...over,
});

describe('le catalogue des packs intégrés (#10189)', () => {
  it('chaque intégré porte un nom et une description non vides dans les sept langues', () => {
    for (const pack of BUILTIN_STICKER_PACKS) {
      expect(Object.keys(pack.names).sort()).toEqual([...PACK_LANGUAGES].sort());
      for (const language of PACK_LANGUAGES) {
        expect(pack.names[language].name).not.toBe('');
        expect(pack.names[language].description).not.toBe('');
      }
      expect(pack.names.en.description).not.toBe(pack.names.fr.description);
    }
  });

  it('`name` et `description` à plat restent la projection française — le fil ne change pas', () => {
    for (const pack of BUILTIN_STICKER_PACKS) {
      expect(pack.name).toBe(pack.names.fr.name);
      expect(pack.description).toBe(pack.names.fr.description);
    }
    expect(BUILTIN_STICKER_PACKS.map((pack) => pack.name)).toEqual(['Mee', 'Meo', 'Mee & Meo']);
  });

  it('`builtinStickerPackNames` rend les sept langues d’un intégré, `null` pour tout autre slug', () => {
    expect(builtinStickerPackNames('mee')?.en.description).toContain('hummingbird');
    expect(builtinStickerPackNames('chats-de-paris')).toBeNull();
  });
});

describe('stickerPackText — la langue de l’interface, puis le repli', () => {
  const mee = BUILTIN_STICKER_PACKS[0]!;
  const builtin = thirdParty({ slug: mee.slug, name: mee.name, description: mee.description, builtin: true });

  it('un intégré servi à plat (sans `names`) se lit dans la langue de l’interface depuis le catalogue', () => {
    expect(stickerPackText(builtin, 'en')).toEqual(mee.names.en);
    expect(stickerPackText(builtin, 'ar')).toEqual(mee.names.ar);
    expect(stickerPackText(builtin, 'fr')).toEqual({ name: mee.name, description: mee.description });
  });

  it('des `names` servis avec le pack priment sur le catalogue', () => {
    const served = { ...builtin, names: { en: { name: 'Mee', description: 'Served by the gateway.' } } };
    expect(stickerPackText(served, 'en').description).toBe('Served by the gateway.');
    expect(stickerPackText(served, 'es')).toEqual(mee.names.es);
  });

  it('un pack de tiers garde son nom et sa description tels quels, dans toutes les langues', () => {
    const pack = thirdParty();
    for (const language of PACK_LANGUAGES) {
      expect(stickerPackText(pack, language)).toEqual({ name: pack.name, description: pack.description });
    }
  });

  it('un pack de tiers qui ne porte pas `builtin` ne lit jamais le catalogue, même sur un slug voisin', () => {
    const pack = thirdParty({ slug: 'mee', builtin: false });
    expect(stickerPackText(pack, 'en')).toEqual({ name: pack.name, description: pack.description });
  });
});
