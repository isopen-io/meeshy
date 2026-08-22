/**
 * Quel module `./routes/communities` désigne-t-il RÉELLEMENT ?
 *
 * Le dépôt porte DEUX implémentations du même domaine :
 *   - `src/routes/communities.ts`   — 16 routes, monolithe
 *   - `src/routes/communities/`     — 13 routes, refactorisation en modules
 *
 * `route-registration.ts` écrit `from './routes/communities'`, et la résolution
 * Node fait gagner le FICHIER sur le RÉPERTOIRE : c'est le monolithe qui est
 * monté, et tout `src/routes/communities/` est du code mort.
 *
 * Ce que cette ambiguïté a coûté (cycle 86) : le gate de présence de
 * `GET /communities/:id/members` avait été écrit — dans le répertoire masqué.
 * Il n'a jamais tourné. La route montée servait `user.isOnline` brut, et
 * `communityMemberSchema.user` étant `userMinimalSchema` qui DÉCLARE le champ,
 * la présence atteignait le fil. Sept fichiers de témoins montent le module
 * masqué ; deux montent le vrai.
 *
 * Ce témoin fige la résolution EFFECTIVE. Il n'approuve pas la situation — il
 * la rend impossible à découvrir par accident une troisième fois. Il tombera si
 * quelqu'un supprime le monolithe, câble le répertoire, ou renomme l'un des
 * deux : autant de moments où l'on VEUT être arrêté et forcé à trancher.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROUTES_DIR = join(__dirname, '..', '..', '..', 'routes');

/** Noms des routes déclarées par un fichier source (`fastify.get('/x', …)`). */
function declaredRoutes(source: string): string[] {
  return [...source.matchAll(/fastify\.(?:get|post|put|patch|delete)\(\s*'([^']+)'/g)]
    .map((m) => m[1])
    .sort();
}

describe('routes/communities — quel module est monté', () => {
  it('`./routes/communities` résout vers le FICHIER, pas le répertoire', () => {
    // `require.resolve` applique la même règle que l'import de
    // `route-registration.ts`. Le suffixe atteste lequel des deux gagne.
    const resolved = require.resolve(join(ROUTES_DIR, 'communities'));
    expect(resolved.endsWith(`${join('routes', 'communities.ts')}`)).toBe(true);
  });

  it('le monolithe monté déclare la route de membres que le répertoire masqué porte aussi', () => {
    const live = readFileSync(join(ROUTES_DIR, 'communities.ts'), 'utf8');
    expect(declaredRoutes(live)).toContain('/communities/:id/members');
  });

  // Le gate est la raison d'être de ce fichier : il doit vivre dans le module
  // MONTÉ. Écrit dans le module masqué, il ne protège personne.
  it('le gate de présence vit dans le module monté', () => {
    const live = readFileSync(join(ROUTES_DIR, 'communities.ts'), 'utf8');
    expect(live).toContain('getPresenceVisibilityService');
  });

  // Constat, pas approbation : les deux implémentations ne se recouvrent pas,
  // donc ni la suppression ni le câblage du répertoire ne sont neutres. La
  // décision revient à un humain — cf. `tasks/realtime-sync-audit-2026-08-22-cycle86.md`.
  it('les deux implémentations DIVERGENT — aucune n est un sur-ensemble de l autre', () => {
    const live = declaredRoutes(readFileSync(join(ROUTES_DIR, 'communities.ts'), 'utf8'));
    const shadowed = ['core', 'members', 'settings', 'search']
      .flatMap((f) => declaredRoutes(readFileSync(join(ROUTES_DIR, 'communities', `${f}.ts`), 'utf8')))
      .sort();

    const onlyShadowed = shadowed.filter((r) => !live.includes(r));
    const onlyLive = live.filter((r) => !shadowed.includes(r));

    expect(onlyShadowed.length).toBeGreaterThan(0);
    expect(onlyLive.length).toBeGreaterThan(0);
  });
});
