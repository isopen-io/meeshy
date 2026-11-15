/**
 * #11327 (S26) — l'identifiant de lens qu'un média DÉCLARE n'est retenu que
 * s'il nomme une lens PUBLIÉE que l'expéditeur a INSTALLÉE. Sans cette garde,
 * n'importe qui accrocherait « Lens par <marque> » à n'importe quel média — le
 * crédit deviendrait une arme contre le partenaire. Fail-closed : un doute, une
 * panne de lecture ⇒ aucun crédit, le média part quand même.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { attributableLensSlug } from '../../../services/packs/lensAttribution';

const ALICE = '68b0000000000000000000a1';
const BOB = '68b0000000000000000000b2';

function db(options: { status?: string; installedBy?: string; down?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    prisma: {
      lensPack: {
        findUnique: async ({ where }: { where: { slug: string } }) => {
          calls.push(`lens:${where.slug}`);
          if (options.down) throw new Error('db down');
          return where.slug === 'aurore' ? { status: options.status ?? 'approved' } : null;
        },
      },
      userStickerPack: {
        findFirst: async ({ where }: { where: { userId: string; packSlug: string; installedAt: { not: null } } }) =>
          where.userId === (options.installedBy ?? ALICE) && where.packSlug === 'lens.aurore' && where.installedAt.not === null ? { id: 'c1' } : null,
      },
    },
  };
}

describe('attributableLensSlug', () => {
  it('retient une lens publiée et installée par l’expéditeur', async () => {
    expect(await attributableLensSlug(db().prisma as never, ALICE, 'aurore')).toBe('aurore');
  });

  it('refuse une lens que l’expéditeur n’a pas installée', async () => {
    expect(await attributableLensSlug(db({ installedBy: BOB }).prisma as never, ALICE, 'aurore')).toBeNull();
  });

  it('refuse une lens qui n’est pas publiée (en attente, refusée, retirée) ou qui n’existe pas', async () => {
    for (const status of ['pending', 'rejected', 'withdrawn']) {
      expect(await attributableLensSlug(db({ status }).prisma as never, ALICE, 'aurore')).toBeNull();
    }
    expect(await attributableLensSlug(db().prisma as never, ALICE, 'inconnue')).toBeNull();
  });

  it('ne lit même pas la base pour une valeur absente ou malformée', async () => {
    const probe = db();
    for (const raw of [undefined, null, '', '../x', 42, { slug: 'aurore' }]) {
      expect(await attributableLensSlug(probe.prisma as never, ALICE, raw)).toBeNull();
    }
    expect(probe.calls).toEqual([]);
  });

  it('une lecture qui tombe ne crédite rien et ne fait pas tomber l’envoi', async () => {
    expect(await attributableLensSlug(db({ down: true }).prisma as never, ALICE, 'aurore')).toBeNull();
  });
});
