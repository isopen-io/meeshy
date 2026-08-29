/**
 * Le CLIQUET d'`api/endpoints.ts` (#4280, critères 2 et 3).
 *
 * `api/endpoints.ts` est un ARTEFACT GÉNÉRÉ — le catalogue des chemins d'API,
 * dérivé MÉCANIQUEMENT de `services/gateway/route-manifest.json` (#4276) par
 * `buildApiEndpointsCatalog()` (`../build-catalog.ts`). Un artefact commité
 * qui peut dériver de ce qu'il décrit n'est qu'une opinion de plus — c'est
 * exactement le défaut que #4280 ferme (contexte de l'issue : le web appelait
 * trois routes `/health/*` qui n'existaient nulle part, #4219 ; il postait
 * vers `/groups`, absente, #4222). Ce test régénère le catalogue à CHAQUE
 * exécution depuis une lecture FRAÎCHE du manifeste et le compare, texte
 * pour texte, à la version commitée : toute divergence — une route
 * ajoutée sans régénérer, une route retirée côté serveur, un verbe changé —
 * le fait rougir.
 *
 * Régénérer : cd packages/shared && npm run api-endpoints:generate
 *
 * ─── Portée : lire un artefact de services/gateway depuis packages/shared ──
 *
 * Ce test lit `services/gateway/route-manifest.json`, un fichier hors du
 * périmètre habituel de ce paquet. C'est un choix ASSUMÉ, pas un raccourci :
 * le dépôt a déjà ce patron ailleurs dans `packages/shared/__tests__` —
 * `password-min-length-parity.test.ts` lit
 * `services/gateway/src/routes/password-reset.ts` par chemin relatif à la
 * racine du dépôt, et `ci/socket-event-emitter-gate.test.ts` (le même
 * répertoire de profondeur que celui-ci : `api/__tests__/` = quatre niveaux
 * sous la racine, comme `__tests__/ci/`) lit `services/gateway/src` en
 * entier pour vérifier la parité des noms d'événements Socket.IO. Les deux
 * s'appuient sur le même fait : la CI de ce paquet tourne depuis un checkout
 * COMPLET du monorepo (`ci.yml`), donc `route-manifest.json` — un fichier
 * COMMITÉ, pas un artefact de build à régénérer — est toujours présent à
 * côté, que ce soit `packages/shared` ou `services/gateway` qui tourne.
 * Aucune copie ni export du manifeste dans `packages/shared` n'est donc
 * nécessaire ; en dupliquer une créerait la fourche que ce lot cherche
 * justement à éviter (§ Prisme Linguistique du CLAUDE.md racine : trois
 * copies indépendantes, trois occasions de diverger).
 *
 * Limite assumée : si `services/gateway/route-manifest.json` est un jour
 * déplacé ou renommé sans mettre à jour CE fichier ET
 * `scripts/generate-api-endpoints.ts`, les deux tomberont avec un message
 * « manifeste introuvable » plutôt qu'une erreur silencieuse — mais aucun
 * outil ne garde ce couplage de CHEMIN lui-même hors de ces deux occurrences.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildApiEndpointsCatalog, type ManifestRouteInput } from '../build-catalog.js';
import { API_ENDPOINTS, API_PATH_TEMPLATES } from '../endpoints.js';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const MANIFEST_PATH = `${REPO_ROOT}services/gateway/route-manifest.json`;
const ENDPOINTS_PATH = `${REPO_ROOT}packages/shared/api/endpoints.ts`;
const REGENERATE_COMMAND = 'cd packages/shared && npm run api-endpoints:generate';

interface RawManifestFile {
  readonly routeCount: number;
  readonly routes: readonly ManifestRouteInput[];
}

function readFreshManifestRoutes(): readonly ManifestRouteInput[] {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  const parsed = JSON.parse(raw) as RawManifestFile;
  return parsed.routes;
}

/** Aplatit `API_ENDPOINTS` en un ensemble de chemins RÉSOLUS — fonctions appelées avec un jeton neutre. */
function flattenGeneratedPaths(): ReadonlySet<string> {
  const paths = new Set<string>();
  const PROBE = '__probe__';

  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      paths.add(node);
      return;
    }
    if (typeof node === 'function') {
      // Chaque fonction générée prend N paramètres `string` et les
      // interpole tels quels — les appeler avec le MÊME jeton neutre rend un
      // chemin comparable au gabarit `:param` du manifeste une fois le
      // jeton ôté (voir `templateShape` ci-dessous).
      const arity = (node as (...args: string[]) => string).length;
      const args = Array.from({ length: arity }, () => PROBE);
      paths.add((node as (...args: string[]) => string)(...args));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const value of Object.values(node as Record<string, unknown>)) visit(value);
    }
  };

  visit(API_ENDPOINTS);
  return paths;
}

/** Ramène un chemin RÉSOLU (jeton `__probe__` compris) à la forme gabarit `:x` du manifeste, pour comparaison ensembliste. */
function templateShape(resolvedPath: string): string {
  return resolvedPath
    .split('/')
    .map((segment) => (segment === '__probe__' ? ':x' : segment))
    .join('/');
}

function manifestShape(rawPath: string): string {
  return rawPath
    .split('/')
    .map((segment) => (segment.startsWith(':') || segment === '*' ? ':x' : segment))
    .join('/');
}

describe('Cliquet — api/endpoints.ts reflète route-manifest.json', () => {
  it("l'artefact généré existe (sinon : régénérer, jamais l'écrire à la main)", () => {
    expect(() => readFileSync(ENDPOINTS_PATH, 'utf8')).not.toThrow();
  });

  it('garde-fou anti-régression du harnais lui-même : au moins une centaine de routes dans le manifeste', () => {
    const routes = readFreshManifestRoutes();
    expect(routes.length).toBeGreaterThan(100);
  });

  it('api/endpoints.ts est identique à une régénération fraîche depuis route-manifest.json', () => {
    const committed = readFileSync(ENDPOINTS_PATH, 'utf8');
    const fresh = buildApiEndpointsCatalog(readFreshManifestRoutes()).source;

    if (fresh === committed) return;

    const committedPaths = new Set(API_PATH_TEMPLATES as readonly string[]);
    const freshPaths = new Set(buildApiEndpointsCatalog(readFreshManifestRoutes()).pathTemplates);

    const added = [...freshPaths].filter((p) => !committedPaths.has(p)).map((p) => `+ ${p}`);
    const removed = [...committedPaths].filter((p) => !freshPaths.has(p)).map((p) => `- ${p}`);
    const bodyChangedOnly = added.length === 0 && removed.length === 0;

    const lignes = [
      ...added,
      ...removed,
      ...(bodyChangedOnly
        ? ['~ mêmes chemins, contenu généré différent (verbe, ordre, ou build-catalog.ts modifié)']
        : []),
    ];

    throw new Error(
      `api/endpoints.ts (${ENDPOINTS_PATH}) est PÉRIMÉ par rapport au manifeste — ` +
        `${lignes.length} différence(s) :\n\n${lignes.slice(0, 80).join('\n')}` +
        (lignes.length > 80 ? `\n… et ${lignes.length - 80} de plus` : '') +
        `\n\nRégénérer avec : ${REGENERATE_COMMAND}`
    );
  });

  it('chaque chemin du catalogue existe encore dans le manifeste — une route RETIRÉE côté serveur fait rougir ce témoin', () => {
    const manifestShapes = new Set(readFreshManifestRoutes().map((route) => manifestShape(route.path)));
    const catalogShapes = [...flattenGeneratedPaths()].map(templateShape);

    const orphaned = catalogShapes.filter((shape) => !manifestShapes.has(shape));

    expect(orphaned).toEqual([]);
  });

  it('chaque route du manifeste est représentée dans le catalogue — une route AJOUTÉE sans régénérer fait rougir ce témoin', () => {
    const manifestShapes = new Set(readFreshManifestRoutes().map((route) => manifestShape(route.path)));
    const catalogShapes = new Set([...flattenGeneratedPaths()].map(templateShape));

    const missing = [...manifestShapes].filter((shape) => !catalogShapes.has(shape));

    expect(missing).toEqual([]);
  });
});
