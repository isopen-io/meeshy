/**
 * LA PLUS RÉCEMMENT ACTIVE SE LIT PAR DEUX FLUX BORNÉS (#19835).
 *
 * Le moteur de ce témoin ÉVALUE l'ordre demandé contre des documents en
 * mémoire, et honore `take` : c'est la seule façon pour qu'une lecture d'un
 * SEUL flux, ou d'une fenêtre trop étroite, puisse FAIRE TOMBER le témoin. Un
 * double qui rend la même ligne quel que soit l'`orderBy` rendrait vertes les
 * trois mutations que ce fichier nomme.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  highestRankedConversation,
  highestRankedConversations,
  outranks,
  rankStreams,
  type RankStream,
  type RankedConversationRow,
} from '../../../../services/conversations/highestRanked';

const at = (iso: string): Date => new Date(iso);

const row = (id: string, lastMessageAt: Date | null, lastActivityAt: Date | null = null): RankedConversationRow => ({
  id,
  lastMessageAt,
  lastActivityAt,
});

/**
 * Le moteur. Il honore l'ordre demandé CLÉ PAR CLÉ — y compris le départage —,
 * le `where` que le flux ajoute, et la borne `take`.
 *
 * Il n'applique PAS `id` de lui-même : un moteur qui départage en douce rend la
 * mutation « retirer `{ id: 'desc' }` d'un ordre » indétectable au COMPORTEMENT,
 * et ne laisse que des assertions sur le littéral de l'`orderBy` — ce qui gèle
 * la forme sans garder la propriété.
 */
function engine(rows: readonly RankedConversationRow[]) {
  const weight = (value: Date | string | null | undefined): number | string =>
    value instanceof Date ? value.getTime() : typeof value === 'string' ? value : Number.NEGATIVE_INFINITY;
  const compare = (a: unknown, b: unknown): number => {
    const [x, y] = [weight(a as never), weight(b as never)];
    return x === y ? 0 : x < y ? -1 : 1;
  };
  return (stream: RankStream, take: number): readonly RankedConversationRow[] => {
    const keys = stream.orderBy.flatMap((entry) => Object.entries(entry));
    const hasActivity = 'lastActivityAt' in stream.where;
    return [...rows]
      .filter((row) => !hasActivity || row.lastActivityAt !== null)
      .sort((a, b) =>
        keys.reduce(
          (verdict, [column, direction]) =>
            verdict || (direction === 'desc' ? -1 : 1) * compare(a[column as 'id'], b[column as 'id']),
          0,
        ),
      )
      .slice(0, take);
  };
}

const firstOf = (rows: readonly RankedConversationRow[]) => {
  const read = engine(rows);
  return highestRankedConversation((stream) => Promise.resolve(read(stream, 1)[0] ?? null));
};

const topOf = (rows: readonly RankedConversationRow[], take: number) => {
  const read = engine(rows);
  return highestRankedConversations((stream) => Promise.resolve(read(stream, take)), take);
};

describe('la gagnante est celle du plus haut RANG, jamais du dernier message', () => {
  it('une conversation REMONTÉE par une activité passe devant une conversation au message plus récent', async () => {
    const lifted = row('aaa', at('2026-11-01T10:00:00Z'), at('2026-11-18T10:00:00Z'));
    const spoken = row('bbb', at('2026-11-10T10:00:00Z'));
    expect(await firstOf([spoken, lifted])).toMatchObject({ id: 'aaa' });
  });

  it('sans aucune activité, la plus récemment parlée gagne — le comportement d’avant #19800', async () => {
    const older = row('aaa', at('2026-11-01T10:00:00Z'));
    const newer = row('bbb', at('2026-11-10T10:00:00Z'));
    expect(await firstOf([older, newer])).toMatchObject({ id: 'bbb' });
  });

  it('une activité ANTÉRIEURE au dernier message ne rétrograde rien : le rang est un max', async () => {
    const spoken = row('aaa', at('2026-11-10T10:00:00Z'), at('2026-11-02T10:00:00Z'));
    const quieter = row('bbb', at('2026-11-05T10:00:00Z'));
    expect(await firstOf([spoken, quieter])).toMatchObject({ id: 'aaa' });
  });

  it('une conversation sans message NI activité ne gagne jamais contre une conversation vivante', async () => {
    expect(await firstOf([row('zzz', null), row('aaa', at('2026-11-01T10:00:00Z'))])).toMatchObject({ id: 'aaa' });
  });

  it('deux conversations muettes se départagent sans `NaN` : le comparateur ne soustrait pas deux rangs', async () => {
    expect(await firstOf([row('aaa', null), row('zzz', null)])).toMatchObject({ id: 'zzz' });
  });

  it('rien à lire ⇒ `null`', async () => {
    expect(await firstOf([])).toBeNull();
  });
});

describe('deux lignes de rang IDENTIQUE se départagent, et toujours de la même façon (#19881)', () => {
  it('le même gagnant quel que soit l’ordre dans lequel les lignes arrivent', async () => {
    const même = at('2026-11-20T10:00:00Z');
    const [a, b] = [row('aaa', même), row('bbb', même)];
    expect(await firstOf([a, b])).toMatchObject({ id: 'bbb' });
    expect(await firstOf([b, a])).toMatchObject({ id: 'bbb' });
  });

  it('l’égalité entre un rang REMONTÉ et un dernier message se départage aussi — la porte ouverte par #19800', async () => {
    const même = at('2026-11-20T10:00:00Z');
    const lifted = row('aaa', at('2026-11-01T10:00:00Z'), même);
    const spoken = row('bbb', même);
    expect(await firstOf([lifted, spoken])).toMatchObject({ id: 'bbb' });
    expect(outranks(spoken, lifted)).toBe(true);
    expect(outranks(lifted, spoken)).toBe(false);
  });
});

describe('les deux flux, et la fenêtre que la preuve du top-K exige', () => {
  it('les deux ordres sont lus, chacun départagé sur `id`, et le flux d’activité ne lit que ce qui en a', () => {
    expect(rankStreams()).toEqual([
      { orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }], where: {} },
      { orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }], where: { lastActivityAt: { not: null } } },
    ]);
  });

  it('le `where` du flux d’activité ne retire aucune gagnante : une ligne sans activité est classée à son rang par le premier flux', async () => {
    const muette = row('zzz', at('2026-11-19T10:00:00Z'));
    const remontee = row('aaa', at('2026-11-01T10:00:00Z'), at('2026-11-18T10:00:00Z'));
    expect(await firstOf([remontee, muette])).toMatchObject({ id: 'zzz' });
    expect((await topOf([remontee, muette], 2)).map((r) => r.id)).toEqual(['zzz', 'aaa']);
  });

  it('un seul flux ne suffit pas : lire `lastMessageAt` seul rate la remontée, lire `lastActivityAt` seul rate la muette', async () => {
    const lifted = row('aaa', at('2026-11-01T10:00:00Z'), at('2026-11-18T10:00:00Z'));
    const spoken = row('bbb', at('2026-11-10T10:00:00Z'));
    const read = engine([spoken, lifted]);
    const [fluxMessage, fluxActivite] = rankStreams();
    const parMessage = read(fluxMessage, 1)[0];
    const parActivite = read(fluxActivite, 1)[0];
    expect(parMessage).toMatchObject({ id: 'bbb' });
    expect(parActivite).toMatchObject({ id: 'aaa' });
    expect(await firstOf([spoken, lifted])).toMatchObject({ id: 'aaa' });
  });

  it('le top-K du rang sort des deux flux, dans l’ordre, sans doublon', async () => {
    const rows = [
      row('a1', at('2026-11-01T10:00:00Z'), at('2026-11-19T10:00:00Z')),
      row('b2', at('2026-11-18T10:00:00Z')),
      row('c3', at('2026-11-02T10:00:00Z'), at('2026-11-17T10:00:00Z')),
      row('d4', at('2026-11-03T10:00:00Z')),
    ];
    expect((await topOf(rows, 3)).map((r) => r.id)).toEqual(['a1', 'b2', 'c3']);
  });

  it('une fenêtre plus étroite que K PERD une ligne — le jeu le prouve : deux remontées dans le MÊME flux', async () => {
    // `a1` et `b2` sont toutes deux remontées, donc toutes deux dans le flux
    // d'activité ; `c3` est dans celui du dernier message. Une fenêtre de 1 par
    // flux ne peut en rendre que DEUX des trois — c'est `b2`, la seconde du flux
    // d'activité, qui tombe. Un jeu où chaque flux ne porte qu'une ligne du
    // top-K ne ferait PAS tomber ce témoin : la mutation y est sans effet.
    const rows = [
      row('a1', at('2026-11-01T10:00:00Z'), at('2026-11-19T10:00:00Z')),
      row('b2', at('2026-11-02T10:00:00Z'), at('2026-11-18T10:00:00Z')),
      row('c3', at('2026-11-20T10:00:00Z')),
    ];
    const read = engine(rows);
    const etroit = await highestRankedConversations((stream) => Promise.resolve(read(stream, 1)), 3);
    expect(etroit.map((r) => r.id)).toEqual(['c3', 'a1']);
    expect((await topOf(rows, 3)).map((r) => r.id)).toEqual(['c3', 'a1', 'b2']);
  });

  it('le départage sur `id` est un COMPORTEMENT, pas une forme : deux lignes de même `lastMessageAt`', async () => {
    const même = at('2026-11-20T10:00:00Z');
    const [petit, grand] = [row('aaa', même), row('zzz', même)];
    expect(await firstOf([petit, grand])).toMatchObject({ id: 'zzz' });
    expect(await firstOf([grand, petit])).toMatchObject({ id: 'zzz' });
    expect((await topOf([petit, grand], 2)).map((r) => r.id)).toEqual(['zzz', 'aaa']);
  });

  it('le départage vaut aussi dans le flux d’ACTIVITÉ : deux lignes de même `lastActivityAt`', async () => {
    const même = at('2026-11-20T10:00:00Z');
    const [petit, grand] = [row('aaa', at('2026-11-01T10:00:00Z'), même), row('zzz', at('2026-11-02T10:00:00Z'), même)];
    expect(await firstOf([petit, grand])).toMatchObject({ id: 'zzz' });
    expect(await firstOf([grand, petit])).toMatchObject({ id: 'zzz' });
  });
});

/**
 * LE `where` D'UN FLUX NE PEUT PAS ÉCRASER CELUI DE SON APPELANT (#19906 bis).
 *
 * Les cinq appelants du rang composent par SPREAD — `{ ...where, ...stream.where }`
 * — ce qui donne à `rankStreams()` le pouvoir d'écraser en silence n'importe
 * quelle clé de l'appelant. Trois d'entre elles décident aujourd'hui de la
 * confidentialité ou de l'exactitude : `AND` porte les prédicats de soft-state
 * (`unsetOrNull`) et le régime de chiffrement, `OR` est la forme que rend chacun
 * de ces prédicats, et `participants` porte l'anti-jointure d'exactitude d'un
 * groupe d'appel. Un flux qui rendrait l'une des trois les retirerait du `where`
 * **sans qu'aucun témoin d'appelant ne tombe** : la requête resterait valide, et
 * servirait simplement plus.
 *
 * Le lot écrit beaucoup sur le danger de deux `OR` frères (leçon 318) ; ce
 * témoin ferme la version de ce danger que le lot a lui-même créée. Il garde la
 * classe pour les CINQ appelants d'un coup, là où un témoin par appelant garderait
 * cinq fois le même cas en laissant le sixième dehors.
 */
describe('un flux du rang ne compose jamais une clé que ses appelants portent', () => {
  const COMPOSANTES = ['AND', 'OR', 'NOT', 'participants'];

  it('aucun `where` de flux ne porte `AND`, `OR`, `NOT` ni `participants`', () => {
    const clés = rankStreams().flatMap((stream) => Object.keys(stream.where));
    expect(clés.filter((clé) => COMPOSANTES.includes(clé))).toEqual([]);
  });

  it('et ce qu’ils portent se limite aux colonnes du RANG', () => {
    const clés = new Set(rankStreams().flatMap((stream) => Object.keys(stream.where)));
    expect([...clés].filter((clé) => !['lastMessageAt', 'lastActivityAt'].includes(clé))).toEqual([]);
  });
});
