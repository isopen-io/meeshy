/**
 * #9600 / #9646 — UN prédicat dit qui peut lire un fichier protégé, et il sert
 * les deux côtés : la route qui le SERT (adresse signée, par identifiant) et la
 * remise temps réel qui DISTRIBUE ses adresses signées. Membre actif, jamais
 * banni (la colonne absente vaut « jamais banni »), et dont le lien de partage
 * d'entrée n'est pas échu.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

import { ADMITTED_FILE_READER_WHERE, withoutExpiredShareLinks } from '../fileReaderAdmission';

const NOW = new Date('2026-10-08T10:00:00.000Z');

describe('ADMITTED_FILE_READER_WHERE', () => {
  it('exige un participant actif, et la colonne de bannissement absente ou nulle', () => {
    expect(ADMITTED_FILE_READER_WHERE).toEqual({
      isActive: true,
      OR: [{ bannedAt: null }, { bannedAt: { isSet: false } }],
    });
  });
});

describe('withoutExpiredShareLinks', () => {
  const linkPrisma = (links: Array<{ id: string; expiresAt: Date | null }>) => ({
    conversationShareLink: { findMany: jest.fn(async () => links) },
  });

  it('ne lit aucun lien quand personne n’est entré par lien', async () => {
    const prisma = linkPrisma([]);
    const kept = await withoutExpiredShareLinks(prisma as never, [{ id: 'p1', shareLinkId: null }], NOW);
    expect(kept).toEqual([{ id: 'p1', shareLinkId: null }]);
    expect(prisma.conversationShareLink.findMany).not.toHaveBeenCalled();
  });

  it('écarte un invité dont le lien est échu, garde celui dont le lien vit ou a disparu', async () => {
    const prisma = linkPrisma([
      { id: 'l-old', expiresAt: new Date(NOW.getTime() - 1) },
      { id: 'l-live', expiresAt: new Date(NOW.getTime() + 60_000) },
    ]);
    const kept = await withoutExpiredShareLinks(
      prisma as never,
      [
        { id: 'p-old', shareLinkId: 'l-old' },
        { id: 'p-live', shareLinkId: 'l-live' },
        { id: 'p-gone', shareLinkId: 'l-gone' },
        { id: 'p-member', shareLinkId: null },
      ],
      NOW,
    );
    expect(kept.map((p) => p.id)).toEqual(['p-live', 'p-gone', 'p-member']);
  });

  it('ferme tous les invités par lien quand la lecture des liens échoue', async () => {
    const prisma = { conversationShareLink: { findMany: jest.fn(async () => { throw new Error('down'); }) } };
    const kept = await withoutExpiredShareLinks(
      prisma as never,
      [{ id: 'p-guest', shareLinkId: 'l1' }, { id: 'p-member', shareLinkId: null }],
      NOW,
    );
    expect(kept.map((p) => p.id)).toEqual(['p-member']);
  });
});
