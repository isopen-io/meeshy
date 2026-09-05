/**
 * **Le CLIQUET du critère 1 de #4713** : les quatre gestes de gestion d'un
 * participant appellent chacun un noyau qui ne connaît PAS Fastify, et les
 * quatre routes restent montées aux mêmes adresses.
 *
 * Les trois témoins voisins (`participant-rights-core`, `participant-role-core`,
 * `participant-ban-core`) prouvent l'appelabilité en APPELANT. Ce qu'ils ne
 * peuvent pas prouver, c'est la NÉGATIVE : rien n'empêche un prochain lot de
 * réintroduire un `reply` dans un noyau, ni de composer une réponse HTTP à
 * l'intérieur — les témoins d'appel continueraient de passer, et #4176
 * découvrirait le couplage en essayant de réutiliser le noyau.
 *
 * D'où ce balayage. Il lit les fichiers, commentaires RETIRÉS (un noyau PARLE
 * de Fastify dans sa doc, et c'est même ce qu'on veut : dire pourquoi il ne
 * l'importe pas). Sans ce retrait, la garde serait rouge sur sa propre
 * documentation — la pire des raisons de rougir.
 *
 * La seconde moitié du critère est la PLUS chère à casser sans le voir : onze
 * appelants de production (web 3, iOS 5, Android 3) tapent quatre chemins. Un
 * témoin qui les nomme rougit si l'un d'eux bouge, y compris d'un caractère.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../../../../routes/__tests__/response-schema-sweep';

const ROUTES = join(__dirname, '../../../../routes/conversations');

const NOYAUX = [
  'participant-rights-core.ts',
  'participant-role-core.ts',
  'participant-ban-core.ts',
] as const;

/**
 * Ce qui trahirait un noyau qui a réappris le transport. `sendSuccess` et
 * `sendError` sont nommés par le critère ; leurs quatre aides spécialisées le
 * sont ici aussi, parce qu'elles passent toutes par `sendError` — ne garder que
 * les deux noms du critère laisserait la porte ouverte à `sendForbidden`.
 */
const MARQUEURS_DE_TRANSPORT: readonly string[] = [
  "from 'fastify'",
  'FastifyInstance',
  'FastifyRequest',
  'FastifyReply',
  'utils/response',
  'sendSuccess',
  'sendError',
  'sendForbidden',
  'sendBadRequest',
  'sendNotFound',
  'sendInternalError',
  'request.',
  'reply.',
];

const lire = (fichier: string): string => readFileSync(join(ROUTES, fichier), 'utf8');

describe('les noyaux des quatre gestes ne connaissent pas Fastify (#4713 critère 1)', () => {
  it('lit bien les trois noyaux — un balayage vide passerait au vert', () => {
    for (const noyau of NOYAUX) {
      expect(lire(noyau).length).toBeGreaterThan(2000);
    }
  });

  it("n'y porte aucun marqueur de transport, commentaires retirés", () => {
    const trouves = NOYAUX.flatMap((noyau) => {
      const code = stripComments(lire(noyau));
      return MARQUEURS_DE_TRANSPORT
        .filter((marqueur) => code.includes(marqueur))
        .map((marqueur) => `${noyau} → ${marqueur}`);
    });

    expect(trouves).toEqual([]);
  });

  it('sait discriminer : le même balayage NOMME un gestionnaire, qui lui en porte', () => {
    const code = stripComments(lire('ban.ts'));
    const trouves = MARQUEURS_DE_TRANSPORT.filter((marqueur) => code.includes(marqueur));

    expect(trouves).toContain("from 'fastify'");
    expect(trouves).toContain('sendSuccess');
  });
});

describe('les quatre routes restent montées, inchangées pour leurs appelants (#4713 critère 1)', () => {
  it('les quatre chemins sont déclarés là où ils l’étaient', () => {
    const declares = [
      ['participants-writes.ts', "'/conversations/:id/participants/:participantId/rights'"],
      ['participant-role.ts', "'/conversations/:id/participants/:userId/role'"],
      ['ban.ts', "'/conversations/:id/participants/:userId/ban'"],
      ['ban.ts', "'/conversations/:id/participants/:userId/unban'"],
    ] as const;

    const manquants = declares.filter(([fichier, chemin]) => !lire(fichier).includes(chemin));

    expect(manquants).toEqual([]);
  });
});
