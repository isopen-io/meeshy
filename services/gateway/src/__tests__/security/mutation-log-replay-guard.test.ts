/**
 * #9603 — qui appelle encore `withMutationLog`, et ce que son REJEU refait.
 *
 * `withMutationLog` rend le résultat d'une mutation sans dire s'il vient d'être
 * PRODUIT ou RELU. Une route qui crédite, diffuse ou notifie APRÈS lui refait
 * donc ces effets à chaque rejeu du même `X-Client-Mutation-Id` — un crédit,
 * une annonce, un push de plus pour un geste unique. Les routes qui portent un
 * effet après le journal lisent le verdict (`withMutationVerdict`,
 * `withMutationOutcome`).
 *
 * Ce garde fige l'inventaire des appelants restants, chacun avec ce que son
 * rejeu refait. Il attrape un NOUVEL appelant qui ne se déclare pas, et un
 * appelant qui en gagne un second. Une entrée qui disparaît (route passée au
 * verdict) se retire d'ici dans le même lot.
 *
 * Ce qu'il ne prouve pas : qu'un appelant déclaré « aucun effet » n'en ait pas
 * gagné un depuis — c'est la relecture de l'entrée, à chaque lot qui touche la
 * route, qui le tient. Les témoins de comportement sont
 * `comments-replay-credit.test.ts` et `posts-create-replay-credit.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, relative } from 'path';

import { stripComments } from '../../routes/__tests__/response-schema-sweep';
import { walk } from '../helpers/file-size-sweep';

const SRC_DIR = join(__dirname, '../..');
const DEFINITION = 'utils/withMutationLog.ts';

const CALL = /\bwithMutationLog\s*(?:<[^>()]*>)?\s*\(/g;

type Declaration = { readonly calls: number; readonly replay: string };

const NO_EFFECT = 'aucun effet après le journal';
const ECHO = 'rediffuse un état ABSOLU à chaque rejeu — écho sans crédit ni notification, suivi #9623';

const INVENTORY: Readonly<Record<string, Declaration>> = {
  'routes/posts/interactions.ts': { calls: 1, replay: `${NO_EFFECT} : retirer un like rejoué ne sait plus quelle réaction est partie et n'annonce rien` },
  'routes/posts/comments.ts': { calls: 2, replay: `édition et suppression : ${ECHO}` },
  'routes/directory/friend-requests-core.ts': { calls: 2, replay: 'renotifie et repousse la demande ou la réponse à chaque rejeu — suivi #9623 ; le crédit social.friendship est protégé par son quota par cible' },
  'routes/directory/blocks.ts': { calls: 2, replay: `${NO_EFFECT} : seule l'invalidation du cache de blocage repart` },
  'routes/me/preferences/preference-router-factory.ts': { calls: 2, replay: ECHO },
  'routes/me/preferences/unified-routes.ts': { calls: 1, replay: ECHO },
  'routes/users/profile-updates.ts': { calls: 1, replay: `${ECHO} ; les crédits de profil sont protégés (un par compte)` },
};

const callers = (): Readonly<Record<string, number>> =>
  Object.fromEntries(
    walk(SRC_DIR)
      .map((path) => ({ path: relative(SRC_DIR, path), code: stripComments(readFileSync(path, 'utf8')) }))
      .filter((file) => file.path !== DEFINITION)
      .map((file) => [file.path, (file.code.match(CALL) ?? []).length] as const)
      .filter(([, calls]) => calls > 0),
  );

describe('les appelants de withMutationLog déclarent ce que leur rejeu refait (#9603)', () => {
  it('le balayage voit les sources du gateway — un balayage vide passerait au vert', () => {
    expect(walk(SRC_DIR).length).toBeGreaterThan(400);
  });

  it('aucun appelant hors de l’inventaire, aucun appel de plus dans un appelant déclaré', () => {
    const declared = Object.fromEntries(Object.entries(INVENTORY).map(([path, entry]) => [path, entry.calls]));
    expect(callers()).toEqual(declared);
  });

  it('la création d’un commentaire et d’une publication lisent le verdict — elles ne sont plus dans l’inventaire', () => {
    const comments = stripComments(readFileSync(join(SRC_DIR, 'routes/posts/comments.ts'), 'utf8'));
    const core = stripComments(readFileSync(join(SRC_DIR, 'routes/posts/core.ts'), 'utf8'));

    expect(comments).toMatch(/withMutationVerdict<CommentResult>\(/);
    expect(core).toMatch(/withMutationVerdict<CreatedPost>\(/);
    expect(INVENTORY['routes/posts/core.ts']).toBeUndefined();
  });

  it('chaque entrée dit ce que son rejeu refait', () => {
    Object.values(INVENTORY).forEach((entry) => expect(entry.replay.length).toBeGreaterThan(20));
  });

  it('rougirait sur un appel neuf — la recherche lit le code, pas la prose', () => {
    expect(stripComments('// withMutationLog(x)\nconst y = 1;').match(CALL)).toBeNull();
    expect(stripComments('const r = await withMutationLog<Foo>({ op });').match(CALL)).toHaveLength(1);
  });
});
