/**
 * **DEUX CONVERSATIONS DE RANG IDENTIQUE À LA FRONTIÈRE D'UNE PAGE** (#19881).
 *
 * `rankBound` borne STRICTEMENT (`lt`) sur le seul rang. Quand deux lignes
 * partagent un rang à la milliseconde et que la frontière d'une page tombe
 * entre elles, la seconde est écartée de la page suivante — et la page d'après
 * borne PLUS BAS que son rang. Elle n'apparaît sur AUCUNE page.
 *
 * Atteignable : `Conversation.lastMessageAt` est `DateTime @default(now())`, et
 * `messagePostSaveEffects` y écrit `new Date()`. Deux conversations créées ou
 * touchées dans la même milliseconde suffisent. Depuis #19800 une seconde porte
 * s'ouvre : l'égalité n'a plus besoin d'être entre deux `lastMessageAt` — le
 * rang d'une ligne REMONTÉE par son activité peut valoir exactement le
 * `lastMessageAt` d'une autre.
 *
 * Le départage existe DÉJÀ dans la même fonction, sous l'autre branche de son
 * premier `if` : le chemin delta trie `[{ updatedAt: 'asc' }, { id: 'asc' }]`
 * et son doc-comment l'explique (« `id` départage les égalités »). Le chemin de
 * rang ne l'a jamais reçu.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { loadRankedConversationPage, type ListRankRow, type RowsQuery } from '../../../routes/conversations/utils/list-rank';
import { listRankFromColumns } from '@meeshy/shared/utils/conversation-list-rank';
import type { MongoDocument } from '../../helpers/mongo-where';
import { moteurDeRang } from '../../helpers/list-rank-engine';

const at = (iso: string) => new Date(iso);
type Ligne = ListRankRow & MongoDocument;

const rang = (row: ListRankRow) => listRankFromColumns(row)!.getTime();

/** L'ordre global : rang décroissant, puis `id` décroissant. */
const parRangPuisId = (lignes: readonly Ligne[]) =>
  [...lignes].sort((x, y) => rang(y) - rang(x) || (x.id < y.id ? 1 : x.id > y.id ? -1 : 0)).map((r) => r.id);

const page = (lignes: readonly Ligne[], curseur: unknown, limit: number) => {
  const moteur = moteurDeRang(lignes);
  return loadRankedConversationPage({
    prisma: moteur.prisma as never,
    readRows: moteur.readRows as never,
    where: {}, curseur: curseur as never, deltaOrder: false, limit, offset: 0,
  }).then((s) => s.map((r) => r.id));
};

/** La marche complète par curseur, une ligne à la fois. */
const marche = async (lignes: readonly Ligne[]) => {
  const vues: string[] = [];
  let curseur: unknown = { genre: 'absent' };
  for (let i = 0; i < lignes.length + 1; i += 1) {
    const p = await page(lignes, curseur, 1);
    if (p.length === 0) break;
    vues.push(...p);
    const borne = lignes.find((l) => l.id === p[0])!;
    curseur = { genre: 'borne', rang: listRankFromColumns(borne)!, id: borne.id };
  }
  return vues;
};

describe('rangs ÉGAUX à la frontière d’une page (#19881)', () => {
  it('deux `lastMessageAt` identiques : aucune ligne perdue, aucune servie deux fois', async () => {
    const lignes: readonly Ligne[] = [
      { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', lastMessageAt: at('2026-11-20T10:00:00.000Z') },
      { id: 'aaaaaaaaaaaaaaaaaaaaaaa2', lastMessageAt: at('2026-11-20T10:00:00.000Z') },
      { id: 'bbbbbbbbbbbbbbbbbbbbbbb1', lastMessageAt: at('2026-11-10T10:00:00.000Z') },
    ];
    const vues = await marche(lignes);
    expect(vues).toEqual(parRangPuisId(lignes));
    expect(new Set(vues).size).toBe(lignes.length);
  });

  it('l’égalité entre un rang REMONTÉE et un `lastMessageAt` (porte ouverte par #19800)', async () => {
    const lignes: readonly Ligne[] = [
      { id: 'ccccccccccccccccccccccc1', lastMessageAt: at('2026-11-02T10:00:00.000Z'), lastActivityAt: at('2026-11-20T10:00:00.000Z') },
      { id: 'ccccccccccccccccccccccc2', lastMessageAt: at('2026-11-20T10:00:00.000Z') },
      { id: 'ddddddddddddddddddddddd1', lastMessageAt: at('2026-11-05T10:00:00.000Z') },
    ];
    const vues = await marche(lignes);
    expect(vues).toEqual(parRangPuisId(lignes));
    expect(new Set(vues).size).toBe(lignes.length);
  });

  it('trois ex aequo d’affilée : la marche les sert tous, dans l’ordre de l’id décroissant', async () => {
    const lignes: readonly Ligne[] = [
      { id: 'eeeeeeeeeeeeeeeeeeeeeee1', lastMessageAt: at('2026-11-20T10:00:00.000Z') },
      { id: 'eeeeeeeeeeeeeeeeeeeeeee2', lastMessageAt: at('2026-11-20T10:00:00.000Z') },
      { id: 'eeeeeeeeeeeeeeeeeeeeeee3', lastMessageAt: at('2026-11-20T10:00:00.000Z') },
    ];
    const vues = await marche(lignes);
    expect(vues).toEqual(['eeeeeeeeeeeeeeeeeeeeeee3', 'eeeeeeeeeeeeeeeeeeeeeee2', 'eeeeeeeeeeeeeeeeeeeeeee1']);
  });
});

/**
 * Les deux témoins suivants gardent les DEUX autres sites qui doivent s'accorder
 * avec la borne, et ils existent parce que les mutations qui les nomment NE
 * TOMBAIENT PAS sans eux : la borne composite et l'ordre du flux A étaient
 * gardés, l'ordre du flux B et la fusion ne l'étaient pas.
 *
 * Ils démontrent une DÉPENDANCE, et c'est la seule forme de preuve possible
 * ici : l'ordre que MongoDB rend entre deux lignes de clé égale n'est pas
 * spécifié. Un témoin ne peut donc pas montrer « le mauvais ordre » — il montre
 * que, sans clé de départage, **le résultat dépend d'un ordre que la requête ne
 * détermine pas**. L'ordre des lignes de la fixture y tient le rôle de cet
 * arbitraire, et il est choisi DIFFÉRENT de l'ordre attendu pour que la
 * dépendance se voie.
 */
describe('les deux autres sites qui doivent s’accorder (#19881)', () => {
  it('la FUSION départage sur l’id : une ligne remontée passe devant une ligne de message de même rang si son id est plus grand', async () => {
    const lignes: readonly Ligne[] = [
      { id: 'gggggggggggggggggggggg1', lastMessageAt: at('2026-11-20T10:00:00.000Z') },
      { id: 'gggggggggggggggggggggg2', lastMessageAt: at('2026-11-01T10:00:00.000Z'), lastActivityAt: at('2026-11-20T10:00:00.000Z') },
    ];
    // Le flux A rend `…1` d'abord (son dernier message EST le rang) ; sans
    // départage, la stabilité du tri de fusion le garde devant.
    expect(await page(lignes, { genre: 'absent' }, 2)).toEqual(['gggggggggggggggggggggg2', 'gggggggggggggggggggggg1']);
  });

  it('la FENÊTRE du flux « par activité » départage sur l’id : à activité égale, c’est l’id le plus grand qui occupe la place', async () => {
    const lignes: readonly Ligne[] = [
      { id: 'hhhhhhhhhhhhhhhhhhhhhh1', lastMessageAt: at('2026-11-02T10:00:00.000Z'), lastActivityAt: at('2026-11-20T10:00:00.000Z') },
      { id: 'hhhhhhhhhhhhhhhhhhhhhh2', lastMessageAt: at('2026-11-01T10:00:00.000Z'), lastActivityAt: at('2026-11-20T10:00:00.000Z') },
    ];
    // `limit: 1` ⇒ la fenêtre du flux B vaut UNE place, et les deux lignes ont
    // la même activité : c'est le départage qui décide laquelle la prend.
    expect(await page(lignes, { genre: 'absent' }, 1)).toEqual(['hhhhhhhhhhhhhhhhhhhhhh2']);
  });
});
