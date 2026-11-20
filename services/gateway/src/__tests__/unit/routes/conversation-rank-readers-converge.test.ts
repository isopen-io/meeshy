/**
 * **LES DEUX LECTEURS DU RANG LISENT LE MÊME SITE** (#19904).
 *
 * Le dépôt porte deux lecteurs de `max(lastMessageAt, lastActivityAt)` (#9026),
 * et c'est assumé : `routes/conversations/utils/list-rank.ts` paie la fenêtre,
 * le curseur et la borne pour la LISTE paginée ; `services/conversations/highestRanked.ts`
 * sert LA plus active (ou les K premières) d'un ensemble que le `where` de
 * l'appelant borne déjà. Aucune des surfaces de #19835 n'a besoin d'une
 * pagination, et la liste ne peut pas s'en passer.
 *
 * Ce qui n'est PAS assumé, c'est que la RÈGLE vive en deux exemplaires. Avant ce
 * lot, `list-rank.ts` redéclarait ses deux `orderBy`, le `where` de son flux
 * d'activité et son propre comparateur. Les trois disaient la même chose que
 * `highestRanked.ts` — ce qui est précisément ce qui rend une jumelle
 * dangereuse : elle est juste le jour où on l'écrit.
 *
 * Ce témoin garde la CONVERGENCE, pas chaque lecteur séparément :
 *
 *  1. ce que la liste ENVOIE à Prisma est, champ pour champ, ce que le site
 *     unique déclare — donc toute évolution du site unique l'atteint ;
 *  2. l'autre lecteur départage bien, lui aussi, sur un jeu de lignes ex aequo ;
 *  3. `list-rank.ts` ne REDÉCLARE aucun ordre de rang — un balayage de source,
 *     parce qu'un lot qui en réécrirait un passerait les deux premiers témoins
 *     sans les faire tomber (il suffirait de réécrire la MÊME valeur).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadRankedConversationPage, type ListRankRow, type RowsQuery } from '../../../routes/conversations/utils/list-rank';
import {
  highestRankedConversation,
  outranks,
  rankStreamByActivity,
  rankStreamByMessage,
} from '../../../services/conversations/highestRanked';
import type { MongoDocument } from '../../helpers/mongo-where';
import { moteurDeRang } from '../../helpers/list-rank-engine';

const at = (iso: string) => new Date(iso);
type Ligne = ListRankRow & MongoDocument;

describe('les deux lecteurs du rang convergent (#19904)', () => {
  it('la LISTE envoie à Prisma les ordres et le filtre que le site unique déclare', async () => {
    const lignes: readonly Ligne[] = [
      { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', lastMessageAt: at('2026-11-20T10:00:00.000Z') },
      { id: 'aaaaaaaaaaaaaaaaaaaaaaa2', lastMessageAt: at('2026-11-01T10:00:00.000Z'), lastActivityAt: at('2026-11-19T10:00:00.000Z') },
    ];
    const moteur = moteurDeRang(lignes);
    const ordres: unknown[] = [];
    const filtres: unknown[] = [];

    await loadRankedConversationPage({
      prisma: {
        conversation: {
          findMany: async (args: { where: unknown; orderBy: unknown; take: number }) => {
            ordres.push(args.orderBy);
            filtres.push(args.where);
            return moteur.lire(args as never) as never;
          },
        },
      } as never,
      readRows: (async (q: RowsQuery) => {
        ordres.push(q.orderBy);
        return moteur.lire(q as never);
      }) as never,
      where: {}, curseur: { genre: 'absent' } as never, deltaOrder: false, limit: 10, offset: 0,
    });

    // Tous les ordres émis sont l'un des DEUX du site unique — aucun troisième.
    const attendus = [rankStreamByMessage().orderBy, rankStreamByActivity().orderBy];
    expect(ordres.length).toBeGreaterThan(0);
    for (const ordre of ordres) expect(attendus).toContainEqual(ordre);

    // Et le flux d'activité ne lit QUE les lignes qui en portent une.
    //
    // Cette assertion a d'abord été écrite `toContain(JSON.stringify(stream.where).slice(1, -1))`
    // — vacuité pure : sous la mutation qu'elle prétendait garder (`where` ramené
    // à `{}`), la tranche rend la chaîne VIDE et `toContain('')` est toujours
    // vrai. Elle épingle donc la CLAUSE, en toutes lettres : le témoin est le
    // second site, et c'est à lui de rougir si le premier change d'avis.
    expect(JSON.stringify(rankStreamByActivity().where)).toBe('{"lastActivityAt":{"not":null}}');
    expect(JSON.stringify(filtres)).toContain('"lastActivityAt":{"not":null}');
  });

  it('l’autre lecteur départage aussi sur l’id, à rang égal', async () => {
    const exAequo = [
      { id: 'bbbbbbbbbbbbbbbbbbbbbbb1', lastMessageAt: at('2026-11-20T10:00:00.000Z'), lastActivityAt: null },
      { id: 'bbbbbbbbbbbbbbbbbbbbbbb2', lastMessageAt: at('2026-11-20T10:00:00.000Z'), lastActivityAt: null },
    ];
    // Chaque flux rend sa tête ; le comparateur partagé tranche l'égalité.
    const gagnante = await highestRankedConversation(async (stream) =>
      stream.orderBy[0] && 'lastActivityAt' in stream.orderBy[0] ? null : exAequo[0]);
    expect(gagnante?.id).toBe('bbbbbbbbbbbbbbbbbbbbbbb1');

    expect(outranks(exAequo[1], exAequo[0])).toBe(true);
    expect(outranks(exAequo[0], exAequo[1])).toBe(false);
  });

  it('`list-rank.ts` ne REDÉCLARE aucun ordre de rang — il les importe', () => {
    const source = readFileSync(
      join(__dirname, '../../../routes/conversations/utils/list-rank.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
     .replace(/\/\/[^\n]*/g, '');

    // Le `desc` des DEUX colonnes du rang n'a qu'un site, et ce n'est pas celui-ci.
    expect(source).not.toMatch(/lastMessageAt\s*:\s*'desc'/);
    expect(source).not.toMatch(/lastActivityAt\s*:\s*'desc'/);
    // Le filtre du flux d'activité non plus.
    expect(source).not.toMatch(/lastActivityAt\s*:\s*\{\s*not\s*:\s*null\s*\}/);
    // Et il importe bien le site unique — sans quoi les trois interdits
    // ci-dessus seraient tenus par un fichier qui ne lit plus le rang du tout.
    expect(source).toMatch(/from '\.\.\/\.\.\/\.\.\/services\/conversations\/highestRanked'/);
  });
});
