import { describe, expect, test } from 'bun:test';

import { BUILTIN_STICKER_PACKS } from '@meeshy/shared/types/sticker-pack';
import type { StickerPackSummary } from '@meeshy/shared/types/sticker-pack';

import { builtinPackDetail } from '@/lib/api/sticker-packs';

import { stickerShopAdapter } from './composer-sticker-shop';

/**
 * **LA BOUTIQUE LIT LES INTÉGRÉS DANS LA LANGUE DE L'INTERFACE** (#10189) —
 * un utilisateur en anglais lit la description anglaise de Mee ; un pack de
 * tiers garde le texte de son auteur ; un intégré servi à plat par un ancien
 * serveur se lit quand même dans la langue de l'interface.
 */

const mee = BUILTIN_STICKER_PACKS[0]!;

const flat = (over: Partial<StickerPackSummary> = {}): StickerPackSummary => ({
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

describe('stickerShopAdapter — titre et description', () => {
  test('un intégré se lit dans la langue de l’interface', () => {
    const detail = builtinPackDetail('mee', true)!;
    expect(stickerShopAdapter('en').description(detail)).toBe(mee.names.en.description);
    expect(stickerShopAdapter('pt').description(detail)).toBe(mee.names.pt.description);
    expect(stickerShopAdapter('fr').description(detail)).toBe(mee.description);
    expect(stickerShopAdapter('en').title(detail)).toBe(mee.names.en.name);
  });

  test('un intégré servi à plat par un ancien serveur se lit aussi dans la langue de l’interface', () => {
    const served = flat({ slug: 'mee', name: 'Mee', description: mee.description, builtin: true, author: 'Meeshy' });
    expect(stickerShopAdapter('es').description(served)).toBe(mee.names.es.description);
  });

  test('un pack de tiers garde le texte de son auteur', () => {
    const pack = flat();
    expect(stickerShopAdapter('en').title(pack)).toBe('Chats de Paris');
    expect(stickerShopAdapter('en').description(pack)).toBe('Des chats qui flânent sur les quais.');
  });
});
