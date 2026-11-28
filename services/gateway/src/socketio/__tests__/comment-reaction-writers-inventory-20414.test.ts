/**
 * **#20414 — LES DEUX TRANSPORTS D'UNE ACTIVITÉ DE COMMENTAIRE ÉCRIVENT LES
 * MÊMES LIGNES.**
 *
 * La décision du 2026-11-28 tranche que l'ordre de livraison de
 * `comment:liked` / `-unliked` et `comment:reaction-added` / `-removed` est
 * **au mieux**, et que ce qui garantit est la CONVERGENCE : le compteur absolu
 * borne l'erreur à « périmée », et une relecture autoritaire la corrige.
 *
 * Cette garantie a une PRÉMISSE, et c'est elle que ce cliquet garde :
 * **les deux transports écrivent la même collection `commentReaction`**, donc
 * la même relecture les réconcilie tous les deux. Un troisième écrivain — ou
 * un chemin qui changerait l'état de réaction d'un commentaire SANS écrire
 * cette collection — la casserait en silence : la relecture rendrait un agrégat
 * qui ignore ce qu'il vient de se passer, et aucun témoin de comportement ne
 * tomberait, puisque chaque chemin, pris seul, serait juste.
 *
 * ─── CE QU'IL NE GARDE PAS, DIT ICI ──────────────────────────────────────
 *
 * Il ne garde ni l'ordre (la décision dit qu'il n'y en a pas), ni la
 * resynchronisation (mesurée SANS APPELANT sur les trois clients — c'est une
 * issue à elle), ni qu'un écrivain écrive la BONNE chose. Il garde une seule
 * propriété : **qu'aucun écrivain neuf n'apparaisse sans que quelqu'un ait dit
 * ce qu'il fait de la convergence.** Quand il tombe, la réparation est cette
 * phrase-là, jamais une ligne d'inventaire.
 *
 * Il est TEXTUEL et étroit, comme `post-room-separation-sweep` : il relève les
 * appels d'écriture Prisma sur `commentReaction` dans les sources de
 * PRODUCTION, et son discriminant est la méthode, pas le mot. Un relevé qui
 * rendrait `[]` serait vert sous n'importe quelle dérive — d'où le témoin de
 * non-vacuité, qui vient en premier.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** La racine des sources de PRODUCTION de la passerelle. */
const SRC = join(__dirname, '..', '..');

/** Les méthodes Prisma qui ÉCRIVENT. `findMany`/`count` ne changent aucun état. */
const WRITE_METHODS = ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'] as const;

const WRITE_CALL = new RegExp(String.raw`commentReaction\s*\.\s*(${WRITE_METHODS.join('|')})\s*\(`, 'g');

/**
 * L'inventaire GELÉ : fichier → méthodes d'écriture, tel que mesuré le
 * 2026-11-28. Les deux bouts des « deux familles » de #20414, et eux seuls.
 */
const FROZEN_WRITERS: Readonly<Record<string, readonly string[]>> = {
  'services/PostCommentService.ts': ['deleteMany', 'upsert'],
  'services/CommentReactionService.ts': ['create', 'deleteMany', 'deleteMany'],
};

function productionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...productionFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** `fichier relatif → méthodes d'écriture relevées`, commentaires dépouillés. */
function sweepWriters(): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const file of productionFiles(SRC)) {
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const methods = [...source.matchAll(WRITE_CALL)].map((m) => m[1]).sort();
    if (methods.length > 0) found[relative(SRC, file).split('\\').join('/')] = methods;
  }
  return found;
}

describe('#20414 — l’inventaire des écrivains de `commentReaction`', () => {
  it('le balayage voit un corpus substantiel — sinon un relevé vide passerait au vert', () => {
    expect(productionFiles(SRC).length).toBeGreaterThan(200);
  });

  it('les écrivains sont EXACTEMENT les deux transports de la décision', () => {
    const found = sweepWriters();
    const normalise = (r: Record<string, readonly string[]>) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v].sort()]));

    /* Quand ceci tombe : un chemin NEUF change l'état de réaction d'un
       commentaire. Dire ce qu'il fait de la convergence — écrit-il
       `commentReaction`, donc la relecture autoritaire le voit-elle ? — puis
       mettre l'inventaire à jour AVEC cette phrase, dans la décision du
       2026-11-28. Jamais l'inverse. */
    expect(normalise(found)).toEqual(normalise(FROZEN_WRITERS));
  });

  it('les deux transports sont bien DEUX services distincts, pas un alias', () => {
    const fichiers = Object.keys(FROZEN_WRITERS);
    expect(fichiers).toHaveLength(2);
    expect(new Set(fichiers).size).toBe(2);
  });
});
