/**
 * Quand `routes/X.ts` et `routes/X/` coexistent, lequel sert ?
 *
 * `route-registration.ts` importe ces modules SANS extension (`'./routes/X'`).
 * Node résout alors LOAD_AS_FILE avant LOAD_AS_DIRECTORY : c'est `X.ts` qui
 * gagne, et `X/index.ts` n'est jamais chargé — sauf si `X.ts` le ré-exporte.
 *
 * Trois scissions du dépôt (`users`, `voice`, `attachments`) portent cette
 * coquille de ré-export et sont donc bien branchées. `communities` ne l'a jamais
 * reçue : son répertoire — `core.ts`, `members.ts`, `settings.ts`, `search.ts` —
 * est INJOIGNABLE, et le legacy `communities.ts` sert seul la production.
 *
 * Ce témoin ne « répare » pas l'ombrage : basculer `communities.ts` en coquille
 * supprimerait quatre routes de production absentes du répertoire
 * (`/communities/mine`, `/:id/join`, `/:id/leave`, `/:id/invite`). C'est une
 * décision de consolidation, pas un correctif de maintenance.
 *
 * Ce qu'il fait, c'est empêcher le piège de se réarmer en silence :
 *  - une NOUVELLE scission sans coquille le fait tomber ;
 *  - la consolidation de `communities` le fait tomber aussi, et oblige alors à
 *    constater ce qu'on branche et ce qu'on retire.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROUTES_DIR = join(__dirname, '../../../routes');

/**
 * Paires `X.ts` + `X/` présentes dans `routes/`, dont le répertoire porte bien
 * un `index.ts` — donc une vraie implémentation alternative, et non un simple
 * dossier d'aides que le fichier importerait pièce par pièce.
 */
const shadowPairs = (): string[] =>
  readdirSync(ROUTES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        existsSync(join(ROUTES_DIR, `${name}.ts`)) &&
        existsSync(join(ROUTES_DIR, name, 'index.ts')),
    )
    .sort();

const isReExportShim = (name: string): boolean =>
  new RegExp(`from\\s+'\\./${name}/index'`).test(
    readFileSync(join(ROUTES_DIR, `${name}.ts`), 'utf8'),
  );

// Répertoires que le fichier voisin N'ATTEINT PAS. Toute entrée ici est du code
// mort au sens strict : il compile, ses tests passent, et il ne s'exécute jamais.
const KNOWN_UNREACHABLE = ['communities'];

describe('ombrage fichier/répertoire dans routes/', () => {
  it('n’a pas d’autre répertoire injoignable que ceux déjà connus', () => {
    const unreachable = shadowPairs().filter((name) => !isReExportShim(name));
    expect(unreachable).toEqual(KNOWN_UNREACHABLE);
  });

  it('garde une coquille de ré-export sur toutes les autres scissions', () => {
    const shimmed = shadowPairs().filter((name) => !KNOWN_UNREACHABLE.includes(name));

    expect(shimmed.length).toBeGreaterThan(0);
    for (const name of shimmed) {
      expect(isReExportShim(name)).toBe(true);
    }
  });
});

// La preuve par le comportement, et non par la lecture des fichiers : le module
// effectivement chargé sous le nom `'../../../routes/communities'` enregistre
// les routes du LEGACY, pas celles du répertoire.
describe('c’est bien routes/communities.ts qui est servi', () => {
  const registeredRoutes = async (): Promise<Set<string>> => {
    const Fastify = (await import('fastify')).default;
    const { communityRoutes } = await import('../../../routes/communities');

    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    const seen = new Set<string>();
    app.addHook('onRoute', (route) => {
      seen.add(`${route.method} ${route.url}`);
    });
    app.decorate('authenticate', async () => undefined);
    app.decorate('prisma', {} as never);

    await communityRoutes(app);
    await app.ready();
    await app.close();
    return seen;
  };

  it('enregistre les routes que seul le legacy porte', async () => {
    const routes = await registeredRoutes();

    expect(routes.has('GET /communities/mine')).toBe(true);
    expect(routes.has('POST /communities/:id/join')).toBe(true);
    expect(routes.has('POST /communities/:id/leave')).toBe(true);
    expect(routes.has('POST /communities/:id/invite')).toBe(true);
  });

  it('n’enregistre AUCUNE route que seul le répertoire porte', async () => {
    const routes = await registeredRoutes();

    expect(routes.has('POST /communities/:id/conversations/:conversationId')).toBe(false);
  });
});
