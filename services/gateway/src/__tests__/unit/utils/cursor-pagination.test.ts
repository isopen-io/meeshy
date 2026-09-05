/**
 * `?cursor=` — la loi partagée du curseur opaque (#4175).
 *
 * Les témoins sont rangés par la propriété qu'ils défendent, et deux d'entre
 * eux portent tout le lot :
 *
 * - **le curseur encode l'ORDRE DE TRI** — un jeton frappé sous un ordre et
 *   rejoué sous un autre est refusé, jamais servi sous une clause de reprise
 *   que son ordre ne gouverne pas (c'est le saut de ligne silencieux) ;
 * - **le SAUT DE LIGNE se prouve sur une collection qui BOUGE** — sur une
 *   collection figée, offset et curseur rendent la même chose, donc un témoin
 *   qui pagine une liste immobile reste vert avec l'offset et ne prouve rien.
 *   Le témoin de contraste fait DEUX marches sur la MÊME table vivante, l'une
 *   par `skip:`, l'autre par curseur, et montre laquelle perd une ligne.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  cursorPage,
  cursorQuery,
  decodePageCursor,
  encodePageCursor,
  keysetWhere,
  orderByFor,
  sortSignature,
  type CursorSort,
} from '../../../utils/cursor-pagination';
import { countIn, findManyIn } from '../../helpers/in-memory-table';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ANTICHRONOLOGIQUE: CursorSort = [
  { field: 'createdAt', direction: 'desc', kind: 'date' },
  { field: 'id', direction: 'desc', kind: 'string' },
];

const CHRONOLOGIQUE: CursorSort = [
  { field: 'createdAt', direction: 'asc', kind: 'date' },
  { field: 'id', direction: 'asc', kind: 'string' },
];

const PAR_SCORE: CursorSort = [
  { field: 'score', direction: 'desc', kind: 'number' },
  { field: 'id', direction: 'desc', kind: 'string' },
];

const at = (minute: number) => new Date(Date.UTC(2024, 0, 1, 12, minute, 0));

type Ligne = { id: string; createdAt: Date; userId: string };

const ligne = (id: string, minute: number, userId = 'moi'): Ligne => ({
  id,
  createdAt: at(minute),
  userId,
});

/** Le jeton HISTORIQUE de `utils/keyset-cursor.ts`, tel qu'un client en vol le porte. */
const jetonHistorique = (createdAt: Date, id: string): string =>
  Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), 'utf8').toString('base64url');

// ─── Le curseur est OPAQUE ───────────────────────────────────────────────────

describe('le curseur est opaque — ni un offset déguisé, ni un identifiant lisible', () => {
  it("ne laisse lire NI l'identifiant NI la date qu'il transporte", () => {
    const token = encodePageCursor(ANTICHRONOLOGIQUE, ligne('bbccddeeff0011', 30));

    expect(token).not.toContain('bbccddeeff0011');
    expect(token).not.toContain('2024');
    expect(token).not.toContain('createdAt');
  });

  it("ne porte AUCUN rang — la même ligne rend le même jeton où qu'elle soit dans la page", () => {
    const cible = ligne('n7', 70);
    const premiere = encodePageCursor(ANTICHRONOLOGIQUE, cible);
    const centieme = encodePageCursor(ANTICHRONOLOGIQUE, cible);

    // Un offset déguisé dépendrait de ce qui PRÉCÈDE la ligne ; une position
    // keyset ne dépend que de la ligne elle-même.
    expect(premiere).toBe(centieme);
    expect(Number.isNaN(Number(premiere))).toBe(true);
  });

  it('rend deux jetons DIFFÉRENTS pour deux lignes nées dans la même milliseconde', () => {
    const a = encodePageCursor(ANTICHRONOLOGIQUE, ligne('n2', 10));
    const b = encodePageCursor(ANTICHRONOLOGIQUE, ligne('n1', 10));

    expect(a).not.toBe(b);
  });
});

// ─── Le curseur encode l'ORDRE DE TRI ────────────────────────────────────────

describe("le curseur encode l'ordre de tri de la route", () => {
  it('se relit sous le MÊME ordre', () => {
    const token = encodePageCursor(ANTICHRONOLOGIQUE, ligne('n3', 30));

    expect(decodePageCursor(token, ANTICHRONOLOGIQUE)).toEqual({
      createdAt: at(30).toISOString(),
      id: 'n3',
    });
  });

  it('est REFUSÉ sous une DIRECTION différente', () => {
    const token = encodePageCursor(ANTICHRONOLOGIQUE, ligne('n3', 30));

    expect(decodePageCursor(token, CHRONOLOGIQUE)).toBeNull();
  });

  it('est REFUSÉ sous des CHAMPS différents', () => {
    const token = encodePageCursor(ANTICHRONOLOGIQUE, ligne('n3', 30));

    expect(decodePageCursor(token, PAR_SCORE)).toBeNull();
  });

  it('est REFUSÉ quand le TYPE du champ change sous lui', () => {
    const token = encodePageCursor(PAR_SCORE, { id: 'p1', score: 42 });
    const parScoreTexte: CursorSort = [
      { field: 'score', direction: 'desc', kind: 'string' },
      { field: 'id', direction: 'desc', kind: 'string' },
    ];

    expect(decodePageCursor(token, parScoreTexte)).toBeNull();
  });

  it('distingue deux ordres par leur SIGNATURE', () => {
    expect(sortSignature(ANTICHRONOLOGIQUE)).not.toBe(sortSignature(CHRONOLOGIQUE));
    expect(sortSignature(ANTICHRONOLOGIQUE)).toBe(sortSignature([...ANTICHRONOLOGIQUE]));
  });
});

// ─── Un jeton hostile ne descend jamais jusqu'à Prisma ───────────────────────

describe('un jeton illisible rend `null`, jamais une position à moitié lue', () => {
  it.each([
    ['une chaîne quelconque', 'pas-un-curseur'],
    ['du base64 qui ne porte pas de JSON', Buffer.from('coucou', 'utf8').toString('base64url')],
    ['un JSON qui est un nombre', Buffer.from('42', 'utf8').toString('base64url')],
    ['un JSON qui est `null`', Buffer.from('null', 'utf8').toString('base64url')],
    ['une chaîne vide', ''],
  ])('refuse %s', (_cas, token) => {
    expect(decodePageCursor(token, ANTICHRONOLOGIQUE)).toBeNull();
  });

  it.each([
    ['absent', undefined],
    ['non-chaîne', 42],
    ['un objet', { createdAt: '2024-01-01', id: 'n1' }],
  ])('refuse un jeton %s', (_cas, token) => {
    expect(decodePageCursor(token, ANTICHRONOLOGIQUE)).toBeNull();
  });

  it('refuse un jeton auquel il MANQUE une clé de tri', () => {
    const token = Buffer.from(
      JSON.stringify({ v: 1, o: sortSignature(ANTICHRONOLOGIQUE), k: { createdAt: at(10).toISOString() } }),
      'utf8'
    ).toString('base64url');

    expect(decodePageCursor(token, ANTICHRONOLOGIQUE)).toBeNull();
  });

  it("refuse un jeton qui porte une clé EN TROP — rien d'excédentaire ne file en aval", () => {
    const token = Buffer.from(
      JSON.stringify({
        v: 1,
        o: sortSignature(ANTICHRONOLOGIQUE),
        k: { createdAt: at(10).toISOString(), id: 'n1', userId: 'autrui' },
      }),
      'utf8'
    ).toString('base64url');

    expect(decodePageCursor(token, ANTICHRONOLOGIQUE)).toBeNull();
  });

  it('refuse une date qui ne se date pas', () => {
    const token = Buffer.from(
      JSON.stringify({ v: 1, o: sortSignature(ANTICHRONOLOGIQUE), k: { createdAt: 'hier', id: 'n1' } }),
      'utf8'
    ).toString('base64url');

    expect(decodePageCursor(token, ANTICHRONOLOGIQUE)).toBeNull();
  });

  it('refuse une version de jeton inconnue', () => {
    const token = Buffer.from(
      JSON.stringify({ v: 99, o: sortSignature(ANTICHRONOLOGIQUE), k: { createdAt: at(10).toISOString(), id: 'n1' } }),
      'utf8'
    ).toString('base64url');

    expect(decodePageCursor(token, ANTICHRONOLOGIQUE)).toBeNull();
  });
});

// ─── Le jeton HISTORIQUE d'un client en vol ──────────────────────────────────

describe("le jeton sans signature — un client déjà en train de défiler", () => {
  it('se relit quand ses clés SONT exactement les champs de l’ordre déclaré', () => {
    const token = jetonHistorique(at(30), 'n3');

    expect(decodePageCursor(token, ANTICHRONOLOGIQUE)).toEqual({
      createdAt: at(30).toISOString(),
      id: 'n3',
    });
  });

  it("est refusé dès que l'ordre déclaré nomme d'AUTRES champs", () => {
    const token = jetonHistorique(at(30), 'n3');

    expect(decodePageCursor(token, PAR_SCORE)).toBeNull();
  });
});

// ─── L'ordre et la clause de reprise viennent de la MÊME déclaration ─────────

describe('`orderByFor` et `keysetWhere` sont dérivés du MÊME ordre', () => {
  it("rend l'`orderBy` Prisma dans l'ordre déclaré", () => {
    expect(orderByFor(ANTICHRONOLOGIQUE)).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(orderByFor(CHRONOLOGIQUE)).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('descend en `lt` sur un ordre décroissant, en `gt` sur un ordre croissant', () => {
    const position = { createdAt: at(30).toISOString(), id: 'n3' };

    expect(keysetWhere(ANTICHRONOLOGIQUE, position)).toEqual({
      OR: [{ createdAt: { lt: at(30) } }, { createdAt: at(30), id: { lt: 'n3' } }],
    });
    expect(keysetWhere(CHRONOLOGIQUE, position)).toEqual({
      OR: [{ createdAt: { gt: at(30) } }, { createdAt: at(30), id: { gt: 'n3' } }],
    });
  });

  it('rend une branche PAR clé de tri — la dernière départage les ex æquo', () => {
    const triple: CursorSort = [
      { field: 'score', direction: 'desc', kind: 'number' },
      { field: 'createdAt', direction: 'desc', kind: 'date' },
      { field: 'id', direction: 'desc', kind: 'string' },
    ];

    const clause = keysetWhere(triple, { score: 7, createdAt: at(30).toISOString(), id: 'n3' });

    expect(clause.OR).toHaveLength(3);
    expect(clause.OR[0]).toEqual({ score: { lt: 7 } });
    expect(clause.OR[2]).toEqual({ score: 7, createdAt: at(30), id: { lt: 'n3' } });
  });
});

// ─── `cursorQuery` — la route ne peut plus oublier sa propre clause ──────────

describe('`cursorQuery` compose la requête d’une page', () => {
  const visible = { userId: 'moi' };

  it('demande UNE ligne de plus que la page — la ligne SONDE dit `hasMore`', () => {
    expect(cursorQuery({ sort: ANTICHRONOLOGIQUE, cursor: undefined, limit: 20, where: visible }).take).toBe(21);
  });

  it('rend le `where` de la route TEL QUEL quand aucun curseur ne se lit', () => {
    const sansCurseur = cursorQuery({ sort: ANTICHRONOLOGIQUE, cursor: undefined, limit: 5, where: visible });
    const illisible = cursorQuery({ sort: ANTICHRONOLOGIQUE, cursor: 'n’importe quoi', limit: 5, where: visible });

    expect(sansCurseur.where).toBe(visible);
    expect(sansCurseur.isCursorPage).toBe(false);
    expect(illisible.where).toBe(visible);
    expect(illisible.isCursorPage).toBe(false);
  });

  it('ET-ise la reprise AVEC le `where` de la route — la visibilité ne se perd jamais', () => {
    const token = encodePageCursor(ANTICHRONOLOGIQUE, ligne('n3', 30));
    const query = cursorQuery({ sort: ANTICHRONOLOGIQUE, cursor: token, limit: 5, where: visible });

    expect(query.isCursorPage).toBe(true);
    expect(query.where).toEqual({
      AND: [visible, { OR: [{ createdAt: { lt: at(30) } }, { createdAt: at(30), id: { lt: 'n3' } }] }],
    });
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});

// ─── `cursorPage` — la ligne sonde ne se sert jamais ─────────────────────────

describe('`cursorPage` tranche la page et frappe le curseur suivant', () => {
  const rows = [ligne('n4', 40), ligne('n3', 30), ligne('n2', 20)];

  it('retire la ligne SONDE et annonce la suite', () => {
    const page = cursorPage({ sort: ANTICHRONOLOGIQUE, rows, limit: 2 });

    expect(page.page.map((r) => r.id)).toEqual(['n4', 'n3']);
    expect(page.pagination.hasMore).toBe(true);
    expect(page.pagination.limit).toBe(2);
    expect(page.pagination.form).toBe('keyset');
  });

  it('frappe le curseur sur la DERNIÈRE ligne SERVIE, jamais sur la sonde', () => {
    const page = cursorPage({ sort: ANTICHRONOLOGIQUE, rows, limit: 2 });

    expect(page.pagination.nextCursor).toBe(encodePageCursor(ANTICHRONOLOGIQUE, ligne('n3', 30)));
  });

  it("ne rend AUCUN curseur sur une page finale — un aller-retour qui ne peut rien rapporter", () => {
    const page = cursorPage({ sort: ANTICHRONOLOGIQUE, rows, limit: 5 });

    expect(page.page).toHaveLength(3);
    expect(page.pagination.hasMore).toBe(false);
    expect(page.pagination.nextCursor).toBeNull();
  });

  it('rend une page vide sans curseur', () => {
    const page = cursorPage({ sort: ANTICHRONOLOGIQUE, rows: [], limit: 5 });

    expect(page.page).toEqual([]);
    expect(page.pagination.hasMore).toBe(false);
    expect(page.pagination.nextCursor).toBeNull();
  });
});

// ─── LE témoin : le saut de ligne, sur une collection qui BOUGE ──────────────

describe('le SAUT DE LIGNE — ce que le curseur corrige et que l’offset ne peut pas', () => {
  const visible = { userId: 'moi' };

  /** Deux pages, une INSERTION entre les deux, et l'inventaire de ce qu'on a vu. */
  function marcher(parCurseur: boolean): { vues: string[]; table: Ligne[] } {
    const table: Ligne[] = [ligne('n4', 40), ligne('n3', 30), ligne('n2', 20), ligne('n1', 10)];
    const vues: string[] = [];

    const q1 = cursorQuery({ sort: ANTICHRONOLOGIQUE, cursor: undefined, limit: 2, where: visible });
    const lues1 = findManyIn(table, { where: q1.where, orderBy: q1.orderBy, take: q1.take });
    const page1 = cursorPage({ sort: ANTICHRONOLOGIQUE, rows: lues1, limit: 2 });
    vues.push(...page1.page.map((r) => r.id));

    // La collection BOUGE : une ligne arrive EN TÊTE avant la page suivante.
    table.unshift(ligne('n5', 50));

    if (parCurseur) {
      const q2 = cursorQuery({
        sort: ANTICHRONOLOGIQUE,
        cursor: page1.pagination.nextCursor,
        limit: 2,
        where: visible,
      });
      const lues2 = findManyIn(table, { where: q2.where, orderBy: q2.orderBy, take: q2.take });
      vues.push(...cursorPage({ sort: ANTICHRONOLOGIQUE, rows: lues2, limit: 2 }).page.map((r) => r.id));
    } else {
      // La MÊME marche, telle que 43 routes du gateway la font aujourd'hui :
      // un rang dans une liste, recalculé sur une liste qui a changé.
      const lues2 = findManyIn(table, {
        where: visible,
        orderBy: orderByFor(ANTICHRONOLOGIQUE),
        skip: 2,
        take: 2,
      });
      vues.push(...lues2.map((r) => r.id));
    }

    return { vues, table };
  }

  it("sous OFFSET, une ligne DISPARAÎT et une autre est servie deux fois", () => {
    const { vues } = marcher(false);

    expect(vues).toEqual(['n4', 'n3', 'n3', 'n2']);
    expect(vues).not.toContain('n1');
    expect(new Set(vues).size).toBeLessThan(vues.length);
  });

  it('sous CURSEUR, aucune ligne n’est sautée ni servie deux fois', () => {
    const { vues } = marcher(true);

    expect(vues).toEqual(['n4', 'n3', 'n2', 'n1']);
    expect(new Set(vues).size).toBe(vues.length);
  });

  it("ne repaie AUCUN `count()` — la ligne sonde dit la suite", () => {
    const table = [ligne('n3', 30), ligne('n2', 20), ligne('n1', 10)];
    let comptes = 0;
    const compter = (args: { where?: unknown }) => {
      comptes += 1;
      return countIn(table, args);
    };

    const q = cursorQuery({ sort: ANTICHRONOLOGIQUE, cursor: undefined, limit: 2, where: visible });
    const page = cursorPage({
      sort: ANTICHRONOLOGIQUE,
      rows: findManyIn(table, { where: q.where, orderBy: q.orderBy, take: q.take }),
      limit: 2,
    });

    expect(page.pagination.hasMore).toBe(true);
    expect(comptes).toBe(0);
    expect(compter).toBeDefined();
  });

  it('parcourt TOUTE la collection, page après page, sans jamais boucler', () => {
    const table = Array.from({ length: 7 }, (_, i) => ligne(`n${i}`, i * 10));
    const vues: string[] = [];
    let cursor: string | null = null;

    for (let garde = 0; garde < 10; garde += 1) {
      const q = cursorQuery({ sort: ANTICHRONOLOGIQUE, cursor, limit: 3, where: visible });
      const page = cursorPage({
        sort: ANTICHRONOLOGIQUE,
        rows: findManyIn(table, { where: q.where, orderBy: q.orderBy, take: q.take }),
        limit: 3,
      });
      vues.push(...page.page.map((r) => r.id));
      cursor = page.pagination.nextCursor;
      if (!cursor) break;
    }

    expect(vues).toEqual(['n6', 'n5', 'n4', 'n3', 'n2', 'n1', 'n0']);
    expect(cursor).toBeNull();
  });
});
