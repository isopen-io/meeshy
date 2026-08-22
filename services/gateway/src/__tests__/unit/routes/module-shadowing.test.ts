/**
 * Quand `routes/X.ts` et `routes/X/` coexistent, lequel sert ?
 *
 * `route-registration.ts` importe ces modules SANS extension (`'./routes/X'`).
 * Node résout alors LOAD_AS_FILE avant LOAD_AS_DIRECTORY : c'est `X.ts` qui
 * gagne, et `X/index.ts` n'est jamais chargé — sauf si `X.ts` le ré-exporte.
 *
 * Les QUATRE scissions du dépôt (`users`, `voice`, `attachments`, et
 * `communities` depuis le cycle 86-bis) portent désormais cette coquille de
 * ré-export. Aucun répertoire n'est plus injoignable.
 *
 * `communities` était la seule à ne l'avoir jamais reçue : son répertoire est
 * resté code mort au sens strict — il compilait, ses suites passaient, il ne
 * s'exécutait jamais — et trois cycles de correctifs y ont atterri sans
 * atteindre la production. La consolidation a d'abord porté dans le répertoire
 * les quatre routes que seul le legacy avait (`/communities/mine`, `/:id/join`,
 * `/:id/leave`, `/:id/invite`), puis basculé le fichier en coquille.
 *
 * Ce témoin empêche le piège de se réarmer : une NOUVELLE scission sans
 * coquille le fait tomber, et le second bloc atteste par le COMPORTEMENT — les
 * routes réellement enregistrées — que la bascule n'a rien retiré.
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

// Répertoires que le fichier voisin N'ATTEINT PAS. Toute entrée ici serait du
// code mort au sens strict : il compile, ses tests passent, et il ne s'exécute
// jamais. La liste est VIDE depuis le cycle 86-bis, et doit le rester.
const KNOWN_UNREACHABLE: string[] = [];

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
// effectivement chargé sous le nom `'../../../routes/communities'` — le
// spécificateur exact qu'emploie `route-registration.ts` — est le RÉPERTOIRE,
// et il porte l'union des deux surfaces.
describe('c’est bien routes/communities/ qui est servi', () => {
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

  it('garde les quatre routes que seul le legacy portait', async () => {
    const routes = await registeredRoutes();

    expect(routes.has('GET /communities/mine')).toBe(true);
    expect(routes.has('POST /communities/:id/join')).toBe(true);
    expect(routes.has('POST /communities/:id/leave')).toBe(true);
    expect(routes.has('POST /communities/:id/invite')).toBe(true);
  });

  it('branche la route que seul le répertoire portait — iOS l’appelle', async () => {
    const routes = await registeredRoutes();

    expect(routes.has('POST /communities/:id/conversations/:conversationId')).toBe(true);
  });
});
