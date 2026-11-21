/**
 * **La pagination une fois la colonne `lastActivityAt` PEUPLÉE** (#19800) — le
 * JUMEAU de `conversation-list-rank-absent-activity.test.ts`, qui garde le cas
 * où elle est ABSENTE (#8309).
 *
 * Ce lot fait passer la colonne d'« absente sur 100 % des lignes » à
 * « présente », et c'est son seul vrai risque : le flux B de
 * `loadRankedConversationPage` (`{ lastActivityAt: { not: null } }`) ne rendait
 * JAMAIS rien, donc `lifted.length === 0` et le chemin rapide était pris à
 * chaque appel. Le chemin de FUSION — les clés de A sur K, le tri par rang, la
 * lecture des lignes manquantes — n'avait jamais tourné en production.
 *
 * Les lecteurs ont été relus un par un avant d'écrire, et ils sont justes. Mais
 * une relecture n'est pas une mesure : ce que ce témoin vérifie, c'est que le
 * chemin qui s'allume ne perd ni ne double aucune ligne, et que le curseur
 * borne sur le RANG — pas sur le dernier message — quand la ligne de bord est
 * une ligne REMONTÉE par son activité. C'est exactement le cas que la colonne
 * vide rendait inatteignable.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { loadRankedConversationPage, type ListRankRow, type RowsQuery } from '../../../routes/conversations/utils/list-rank';
import { listRankFromColumns } from '@meeshy/shared/utils/conversation-list-rank';
import type { MongoDocument } from '../../helpers/mongo-where';
import { moteurDeRang } from '../../helpers/list-rank-engine';

const at = (iso: string) => new Date(iso);

/**
 * Cinq lignes qui couvrent les trois états de la colonne, parce que la
 * population en porte désormais trois : deux REMONTÉES par leur activité (ce
 * que ce lot rend possible), une à `null` explicite, deux sans la clé — la
 * forme que la création produit, et qui restera celle de toute conversation
 * qui n'a connu que des messages.
 */
const rows: readonly (ListRankRow & MongoDocument)[] = [
  { id: 'a-msg-recent', lastMessageAt: at('2026-11-10T10:00:00Z') },
  { id: 'b-remontee', lastMessageAt: at('2026-11-01T10:00:00Z'), lastActivityAt: at('2026-11-09T10:00:00Z') },
  { id: 'c-msg', lastMessageAt: at('2026-11-08T10:00:00Z'), lastActivityAt: null },
  { id: 'd-remontee', lastMessageAt: at('2026-11-02T10:00:00Z'), lastActivityAt: at('2026-11-07T10:00:00Z') },
  { id: 'e-msg-vieux', lastMessageAt: at('2026-11-05T10:00:00Z') },
];

const rang = (row: ListRankRow) => listRankFromColumns(row)!.getTime();
const attendu = [...rows].sort((x, y) => rang(y) - rang(x)).map((r) => r.id);

const page = (curseur: unknown, limit: number) => {
  const moteur = moteurDeRang(rows as readonly MongoDocument[]);
  return loadRankedConversationPage({
    prisma: moteur.prisma as never,
    readRows: moteur.readRows as never,
    where: {}, curseur: curseur as never, deltaOrder: false, limit, offset: 0,
  }).then((s) => s.map((r) => r.id));
};

const borneSur = (ligne: ListRankRow) => ({ genre: 'borne', rang: listRankFromColumns(ligne)!, id: ligne.id });

describe('pagination par curseur, colonne PEUPLÉE', () => {
  it('l’ordre global est celui du rang', async () => {
    expect(await page({ genre: 'absent' }, 10)).toEqual(attendu);
    expect(attendu).toEqual(['a-msg-recent', 'b-remontee', 'c-msg', 'd-remontee', 'e-msg-vieux']);
  });

  it('page 1 puis page 2 par le curseur : aucune ligne perdue, aucune servie deux fois', async () => {
    const p1 = await page({ genre: 'absent' }, 2);
    const dernier = rows.find((r) => r.id === p1[p1.length - 1])!;
    const p2 = await page(borneSur(dernier), 10);
    expect([...p1, ...p2]).toEqual(attendu);
    expect(new Set([...p1, ...p2]).size).toBe(attendu.length);
  });

  it('page 2 depuis une ligne REMONTÉE borne bien sur le rang, pas sur le dernier message', async () => {
    const remontee = rows.find((r) => r.id === 'b-remontee')!;
    const suite = await page(borneSur(remontee), 10);
    expect(suite).toEqual(['c-msg', 'd-remontee', 'e-msg-vieux']);
  });
});
