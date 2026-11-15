/**
 * Cliquet — l'`allowList` global n'est inerte pour les routes à config PROPRE
 * QUE tant qu'aucune d'elles n'est montée sur un chemin de sonde (#5333).
 *
 * ## Ce que #5333 constate
 *
 * `mergeParams` d'@fastify/rate-limit (`Object.assign`) étale `allowList`,
 * comme `skipOnError` (#4687), dans toute config de route qui ne le redéclare
 * pas. Contrairement à `skipOnError`, dont l'omission a déjà coûté un
 * fail-open silencieux sur trois familles de routes, `allowList` ici n'encode
 * aucun choix PAR ROUTE : c'est une exemption d'infrastructure (les sondes de
 * disponibilité), valable identiquement pour la plateforme entière. L'exiger
 * de chacune des ~50 configs de route dupliquerait cette connaissance dans des
 * dizaines de fabriques qui n'ont rien à voir avec elle.
 *
 * Cette duplication ne protège contre RIEN aujourd'hui parce qu'`onRoute`
 * (`@fastify/rate-limit/index.js:174`) monte le limiteur de LA ROUTE à la
 * place du global — jamais en plus. Une route ne peut donc hériter d'une
 * exemption de sonde qui *s'applique* que si elle est elle-même montée sur un
 * des chemins de sonde. Mesuré sur `route-manifest.json` : aucune route à
 * `config.rateLimit` propre ne l'est.
 *
 * ## Ce que ce témoin garde
 *
 * Cette disjonction n'est pas un fait acquis une fois pour toutes — c'est
 * l'état ACTUEL du manifeste de routes, gardé par son propre cliquet
 * (`route-manifest-ratchet.test.ts`) mais qui ne dit rien de qui porte un
 * `config.rateLimit`. Ce témoin lit le manifeste RÉEL (jamais une liste
 * recopiée à la main, qui dériverait au premier ajout de route) et exige que
 * les seules routes montées sur `HEALTH_PROBE_ALLOWLISTED_PATHS`
 * (`middleware/rate-limiter.ts`) soient les sondes de santé elles-mêmes
 * (`routes/health/index.ts`, ou la route racine `/health` du serveur).
 *
 * **Quand il tombe** : une route neuve vient d'atterrir sur un chemin de
 * sonde. C'est CE moment-là qui doit rouvrir la question — cette route
 * déclare-t-elle un `config.rateLimit` propre ? Si oui, son `allowList` hérité
 * cesse d'être inerte, et la décision de #5333 doit être révisée pour ce
 * site : soit documenter explicitement l'héritage à CETTE route, soit lui
 * faire déclarer son propre `allowList`.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEALTH_PROBE_ALLOWLISTED_PATHS } from '../../../middleware/rate-limiter';

const RACINE_GATEWAY = join(__dirname, '..', '..', '..', '..');

type ManifestRoute = { readonly method: string; readonly path: string; readonly module: string };
type Manifest = { readonly routes: readonly ManifestRoute[] };

function chargerManifeste(): Manifest {
  const brut = readFileSync(join(RACINE_GATEWAY, 'route-manifest.json'), 'utf8');
  return JSON.parse(brut) as Manifest;
}

const MODULES_DE_SONDE = new Set([
  'healthProbeRoutes',
  "registerAllRoutes (déclaration directe sur l'instance racine, hors server.register)",
]);

describe('Les chemins exemptés du débit ne portent que des sondes de santé', () => {
  it('la liste exemptée existe et porte au moins les quatre chemins connus', () => {
    expect(HEALTH_PROBE_ALLOWLISTED_PATHS).toEqual(
      expect.arrayContaining(['/health', '/healthz', '/ready', '/api/v1/health/ready'])
    );
  });

  it('le manifeste porte bien au moins une route de sonde — la borne de non-vacuité', () => {
    const { routes } = chargerManifeste();
    const sondes = routes.filter((r) => HEALTH_PROBE_ALLOWLISTED_PATHS.includes(r.path));
    expect(sondes.length).toBeGreaterThan(0);
  });

  it('aucune route montée sur un chemin exempté n\'appartient à un module AUTRE qu\'une sonde de santé', () => {
    const { routes } = chargerManifeste();
    const intrus = routes.filter(
      (r) => HEALTH_PROBE_ALLOWLISTED_PATHS.includes(r.path) && MODULES_DE_SONDE.has(r.module) === false
    );

    // Un `toEqual([])` nomme la route fautive dans le diff Jest plutôt qu'un
    // simple compte — la même route est ce qu'il faut lire pour décider la
    // question posée en tête de fichier.
    expect(intrus).toEqual([]);
  });

  /**
   * Preuve que ce témoin PEUT rougir — sans elle, un manifeste mal lu ou une
   * liste vide le laisserait vert pour la mauvaise raison.
   */
  it('ROUGIT si un module non-sonde était monté sur un chemin exempté', () => {
    const routesFabriquees: readonly ManifestRoute[] = [
      { method: 'GET', path: '/health', module: 'unAutreModule' },
    ];
    const intrus = routesFabriquees.filter(
      (r) => HEALTH_PROBE_ALLOWLISTED_PATHS.includes(r.path) && MODULES_DE_SONDE.has(r.module) === false
    );
    expect(intrus).toEqual([{ method: 'GET', path: '/health', module: 'unAutreModule' }]);
  });
});
