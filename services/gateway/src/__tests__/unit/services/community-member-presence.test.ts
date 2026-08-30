/**
 * Témoin de #4277 (critère 5) — `community-member-presence.ts` a déménagé de
 * `routes/` vers `services/` : ce module n'enregistre aucune route. Ce
 * fichier prouve DEUX choses : (1) l'implémentation RÉELLE, à sa nouvelle
 * adresse, résout bien la présence par viewer ; (2) l'ancienne adresse a
 * DISPARU — la scission est terminée.
 *
 * La seconde garde a changé de SENS au point 2 de #4317, et c'est voulu.
 * Tant que `routes/communities/search.ts` importait `../community-member-presence`,
 * le témoin utile était « la coquille réexporte bien la même fonction » : il
 * gardait un pont. Le pont franchi — `search.ts` repointé, coquille supprimée —
 * ce témoin serait devenu VERT PAR OMISSION, la pire forme de garde : il aurait
 * survécu à la suppression de son sujet sans rougir, en n'ayant plus rien à
 * dire. Le témoin qui le remplace est NÉGATIF et se relit par la seule question
 * qui vaille : rougirait-il si on réintroduisait l'interdit ? Oui — recréer
 * `routes/community-member-presence.ts`, ou réécrire l'import dans `routes/`,
 * le fait tomber.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const mockResolveForTargets = jest.fn<any>();

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn(() => ({
    resolveForTargets: (...args: unknown[]) => mockResolveForTargets(...args),
  })),
}));

jest.mock('../../../routes/users/presence-gate', () => ({
  viewerFromRequest: jest.fn(() => ({ kind: 'anonymous' })),
}));

function fakeFastify(): FastifyInstance {
  return { prisma: {} } as unknown as FastifyInstance;
}

function fakeRequest(): FastifyRequest {
  return {} as FastifyRequest;
}

describe('services/community-member-presence.ts — nouvelle adresse (#4277)', () => {
  it('resolveCommunityMemberPresence agrège les ids de membres de TOUTES les communautés et délègue au viewer résolu', async () => {
    const { resolveCommunityMemberPresence } = await import('../../../services/community-member-presence');
    mockResolveForTargets.mockResolvedValueOnce(new Map([['u1', { showOnline: true }]]));

    const result = await resolveCommunityMemberPresence(fakeFastify(), fakeRequest(), [
      { id: 'c1', members: [{ user: { id: 'u1', isOnline: true } }, { user: null }] },
      { id: 'c2', members: [{ user: { id: 'u1', isOnline: true } }] }, // id dupliqué, dédupliqué par le Set
    ]);

    expect(mockResolveForTargets).toHaveBeenCalledWith({ kind: 'anonymous' }, ['u1']);
    expect(result.get('u1')).toEqual({ showOnline: true });
  });

  it('rend une Map vide sans appeler le service quand aucune communauté ne porte de membre identifiable', async () => {
    const { resolveCommunityMemberPresence } = await import('../../../services/community-member-presence');
    mockResolveForTargets.mockClear();

    const result = await resolveCommunityMemberPresence(fakeFastify(), fakeRequest(), [
      { id: 'c1', members: [] },
    ]);

    expect(result.size).toBe(0);
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });
});

describe('routes/community-member-presence.ts — la coquille a été retirée (#4317)', () => {
  const routesDir = path.join(__dirname, '..', '..', '..', 'routes');

  it("n'existe plus : la scission de #4277 est TERMINÉE, plus seulement amorcée", () => {
    expect(fs.existsSync(path.join(routesDir, 'community-member-presence.ts'))).toBe(false);
  });

  it("n'est plus importée depuis routes/ — sinon la coquille devrait revivre", () => {
    const coupables: string[] = [];

    const parcourir = (dossier: string): void => {
      for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
        const complet = path.join(dossier, entree.name);
        if (entree.isDirectory()) {
          parcourir(complet);
          continue;
        }
        if (!entree.name.endsWith('.ts')) continue;
        // On cherche l'ancienne adresse SOUS routes/, jamais la nouvelle : un
        // import de `../../services/community-member-presence` est exactement
        // ce que ce lot a posé, et doit rester vert.
        if (/from\s+'(\.\.\/)+community-member-presence'/.test(fs.readFileSync(complet, 'utf8'))) {
          coupables.push(path.relative(routesDir, complet));
        }
      }
    };

    parcourir(routesDir);

    expect(coupables).toEqual([]);
  });
});
