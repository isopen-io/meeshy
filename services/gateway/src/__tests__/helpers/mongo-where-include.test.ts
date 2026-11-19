/**
 * LE DOUBLE PARTAGÉ A ENFIN DES TÉMOINS À LUI (#19604, constat d-1 de l'audit).
 *
 * `__tests__/helpers/mongo-where.ts` est importé par **114 fichiers** et atteste
 * des gardes de confidentialité et d'appartenance. Il a reçu `include` sans un
 * seul témoin direct, et l'audit adversarial l'a mesuré : muter `hydrate` pour
 * que `include` se comporte comme `select` — c'est-à-dire détruire précisément
 * « la différence qui décide d'un défaut d'appartenance » — laissait **2 047
 * témoins verts** sur les 101 suites consommatrices. Retirer le garde-fou
 * `select` + `include` passait de même.
 *
 * > **Une primitive de test est du CODE DE PRODUCTION pour les témoins qui la
 * > consomment.** Le dépôt l'écrit déjà dans l'autre sens (« un double de test
 * > ment aussi par ce qu'il ACCEPTE », cycle 112) ; ce fichier en est la
 * > conséquence : ce qui atteste doit être attesté.
 *
 * ─── Ce que ces témoins GÈLENT, limites comprises ─────────────────────────
 *
 * Le double n'a pas de schéma, donc il ne peut pas être fidèle à Prisma sur
 * tout. Les écarts qui RESTENT sont gelés ici **comme des écarts**, pas
 * découverts par la prochaine personne : un écart documenté par un témoin se
 * relit comme une décision, un écart tacite comme un bug.
 *
 * Et aucun de ces écarts ne rend le double plus PERMISSIF que la production —
 * c'est le seul sens qui compte pour un double qui atteste des gardes, parce
 * que c'est celui qui rend un témoin vert sur une garde inerte.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { findUniqueIn } from './mongo-where';

const VIVANT = { isActive: true, OR: [{ bannedAt: null }, { bannedAt: { isSet: false } }] };

const message = {
  id: 'm1',
  content: 'coucou',
  conversation: {
    id: 'c1',
    encryptionMode: 'server',
    participants: [
      { id: 'p-vivant', isActive: true },
      { id: 'p-banni', isActive: true, bannedAt: new Date('2026-11-01T00:00:00.000Z') },
    ],
    blockedUsers: [{ id: 'u-bloque' }],
  },
};

const read = (args: Record<string, unknown>) =>
  findUniqueIn([message as Record<string, unknown>])(args as never);

describe('le double Mongo partagé — `include` (#19604)', () => {
  it('HONORE le `where` d’une relation incluse : c’est la porte que ce double existe pour voir', async () => {
    const row = (await read({
      where: { id: 'm1' },
      include: { conversation: { include: { participants: { where: VIVANT } } } },
    })) as any;

    expect(row.conversation.participants.map((p: any) => p.id)).toEqual(['p-vivant']);
  });

  it('rend les SCALAIRES sans qu’on les nomme — c’est ce qui distingue `include` de `select`', async () => {
    const row = (await read({ where: { id: 'm1' }, include: { conversation: true } })) as any;

    expect(row.content).toBe('coucou');
    expect(row.id).toBe('m1');
  });

  it('NE rend PAS une relation to-many que l’`include` ne nomme pas : un double plus permissif que la production atteste une garde INERTE', async () => {
    const row = (await read({
      where: { id: 'm1' },
      include: { conversation: { include: { participants: { where: VIVANT } } } },
    })) as any;

    // `blockedUsers` n'est pas inclus : en production il vaut `undefined`.
    expect(row.conversation.blockedUsers).toBeUndefined();
    expect(row.conversation.participants).toBeDefined();
  });

  it('une relation to-many ABSENTE du document rend `[]`, jamais `null` — sans quoi un `.some()` JETTE au lieu de rendre `false`', async () => {
    const sansParticipants = findUniqueIn([{ id: 'm2', conversation: { id: 'c2' } } as Record<string, unknown>]);
    const row = (await sansParticipants({
      where: { id: 'm2' },
      include: { conversation: { include: { participants: { where: VIVANT } } } },
    } as never)) as any;

    expect(row.conversation.participants).toEqual([]);
    expect(() => row.conversation.participants.some(() => true)).not.toThrow();
  });

  it('REFUSE un `where` posé sur ce qui n’est pas une liste, là où Prisma refuse la requête', async () => {
    await expect(
      read({ where: { id: 'm1' }, include: { conversation: { where: { id: 'c1' } } } })
    ).rejects.toThrow('sur une relation qui n\'est pas une liste');
  });

  it('REFUSE `select` et `include` au même niveau, à la racine comme imbriqués', async () => {
    await expect(
      read({ where: { id: 'm1' }, select: { id: true }, include: { conversation: true } })
    ).rejects.toThrow('`select` et `include` au même niveau');

    await expect(
      read({ where: { id: 'm1' }, include: { conversation: { select: { id: true }, include: { participants: true } } } })
    ).rejects.toThrow('`select` et `include` au même niveau');
  });

  it('REFUSE un `orderBy` imbriqué plutôt que de trier faux en silence', async () => {
    await expect(
      read({ where: { id: 'm1' }, include: { conversation: { include: { participants: { orderBy: { id: 'asc' } } } } } })
    ).rejects.toThrow('sélection non supportée');
  });

  describe('les écarts à Prisma qui SUBSISTENT — gelés comme écarts, aucun n’étant permissif', () => {
    it('un document embarqué non nommé reste reporté : faute de schéma, composite et relation to-one ne se distinguent pas', async () => {
      const row = (await read({ where: { id: 'm1' }, include: {} })) as any;

      // Prisma ne rendrait pas une relation TO-ONE non incluse ; il rendrait un
      // type COMPOSITE. Le double ne peut pas les séparer et garde les deux.
      expect(row.conversation).toBeDefined();
      // La liste de documents, elle, est bien retirée : c'est la moitié qui coûte.
      expect(row.conversation.participants).toBeDefined();
    });

    it('un scalaire absent du document reste ABSENT sous `include`, quand `select` le rend `null`', async () => {
      const parInclude = (await read({ where: { id: 'm1' }, include: {} })) as any;
      const parSelect = (await read({ where: { id: 'm1' }, select: { id: true, inexistant: true } })) as any;

      expect('inexistant' in parInclude).toBe(false);
      expect(parSelect.inexistant).toBeNull();
    });
  });
});
