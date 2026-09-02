/**
 * `GET /auth/revoke-all-sessions` — la DÉCISION : ce plafond compte l'ADRESSE,
 * et il le DIT.
 *
 * ## Ce que la route est
 *
 * Le lien « ce n'était pas moi » d'un e-mail « nouvelle connexion détectée ».
 * Elle n'a AUCUNE authentification : elle prend un JWT en querystring et le
 * vérifie elle-même dans son handler. Il n'existe donc pas d'appelant connu
 * avant la vérification — ni `authContext`, ni `request.user`, à aucun hook.
 *
 * ## Pourquoi l'adresse, et pas le compte
 *
 * Trois raisons, et elles se tiennent :
 *
 * 1. **Le sujet n'existe qu'après vérification.** Le dériver dans le
 *    `keyGenerator` obligerait à `jwt.verify` une entrée ENTIÈREMENT choisie
 *    par l'appelant, à chaque requête, AVANT tout plafond — le limiteur
 *    deviendrait lui-même l'amplificateur qu'il est censé borner.
 * 2. **La population à freiner n'a pas de compte.** Ce que ce plafond borne
 *    est une rafale de jetons INVALIDES ; un jeton valide veut dire que le
 *    destinataire légitime a cliqué son lien. Une clé par compte laisserait
 *    donc la rafale se ranger dans le repli `ip:` de toute façon.
 * 3. **Une route à `config.rateLimit` n'a plus le limiteur global.**
 *    `onRoute` (@fastify/rate-limit `index.js:174`) monte le limiteur de
 *    route À LA PLACE du global, jamais en plus. Ce plafond-ci est donc le
 *    SEUL rempart par adresse de cette route : lui retirer l'adresse la
 *    laisserait sans aucun.
 *
 * Ce que ce choix CÈDE, et pourquoi c'est acceptable : deux victimes derrière
 * une même sortie NAT qui cliquent leur lien dans la même minute se partagent
 * les cinq essais. À ce plafond, personne n'y touche.
 *
 * ## Ce que le témoin garde vraiment
 *
 * Pas « la clé est une adresse » — c'était déjà vrai par HÉRITAGE silencieux
 * (`mergeParams` = `Object.assign`, la config nue prenait le
 * `keyGenerator` global). Il garde que la route le DÉCLARE : `hook`,
 * `keyGenerator` et `skipOnError` écrits sur place, donc une décision qu'on
 * peut lire, et qu'un changement du limiteur global ne peut plus renverser
 * sans que personne le remarque.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { registerRevokeAllSessionsRoute } from '../../../routes/auth/revoke-all-sessions';
import type { AuthRouteContext } from '../../../routes/auth/types';

type ConfigDeDebit = Record<string, unknown>;

/**
 * Récupère la config TELLE QUE LA ROUTE LA DÉCLARE. Un littéral n'a pas de
 * nom : il ne peut pas s'importer, et le lire par `onRoute` est la seule
 * façon d'assert dessus sans en recopier une jumelle dans le témoin.
 */
async function configDeclaree(): Promise<ConfigDeDebit> {
  const app = Fastify({ logger: false });
  let vue: ConfigDeDebit | null = null;

  app.addHook('onRoute', (routeOptions) => {
    const opts = routeOptions as unknown as { config?: { rateLimit?: ConfigDeDebit } };
    if (opts.config?.rateLimit) vue = opts.config.rateLimit;
  });

  registerRevokeAllSessionsRoute({ fastify: app } as unknown as AuthRouteContext);
  await app.ready();
  await app.close();

  if (vue === null) throw new Error('la route ne déclare aucun config.rateLimit');
  return vue;
}

async function verdictsParAdresse(
  appels: ReadonlyArray<readonly [adresse: string, nombre: number]>
): Promise<Record<string, number[]>> {
  const app: FastifyInstance = Fastify({ logger: false });

  await app.register(rateLimit, {
    global: false,
    skipOnError: true,
    keyGenerator: (request) => `global:${request.ip}`,
  });
  registerRevokeAllSessionsRoute({ fastify: app } as unknown as AuthRouteContext);
  await app.ready();

  const verdicts: Record<string, number[]> = {};
  for (const [adresse, nombre] of appels) {
    verdicts[adresse] = [];
    for (let i = 0; i < nombre; i += 1) {
      const reponse = await app.inject({
        method: 'GET',
        url: '/revoke-all-sessions?token=jeton-invalide',
        remoteAddress: adresse,
      });
      verdicts[adresse].push(reponse.statusCode);
    }
  }

  await app.close();
  return verdicts;
}

describe('Le plafond du lien « ce n\'était pas moi » DÉCLARE sa clé', () => {
  it('déclare son hook au lieu de le laisser au défaut du plugin', async () => {
    const config = await configDeclaree();
    expect(config.hook).toBe('onRequest');
  });

  /**
   * Sans `keyGenerator` propre, la config prenait celui des paramètres
   * GLOBAUX par `Object.assign`. La clé n'aurait pas changé de nature — elle
   * aurait changé de PROPRIÉTAIRE, et le jour où le global compte autre chose
   * (un compte, un jeton, un locataire), cette route l'aurait suivi sans
   * qu'une ligne de son fichier bouge.
   */
  it('déclare son propre keyGenerator, dans son propre espace de noms', async () => {
    const config = await configDeclaree();
    const generateur = config.keyGenerator as (r: { ip: string }) => string;

    expect(typeof generateur).toBe('function');
    expect(generateur({ ip: '203.0.113.7' })).toContain('203.0.113.7');
    expect(generateur({ ip: '203.0.113.7' })).not.toBe(generateur({ ip: '198.51.100.4' }));
    expect(generateur({ ip: '203.0.113.7' })).not.toContain('global:');
  });

  /**
   * Ce lien est le SEUL site du dépôt qui coupe réellement les sockets d'un
   * intrus (#4141). Le fermer pendant une panne du magasin de compteurs
   * répondrait 500 à la victime — et laisserait l'intrus connecté. L'abus
   * qu'on laisse alors passer est une rafale de jetons invalides, dont le
   * coût s'arrête à une vérification de signature. Ouvert, donc — mais ÉCRIT.
   */
  it('assume son échec OUVERT au lieu de l\'hériter', async () => {
    const config = await configDeclaree();
    expect(Object.prototype.hasOwnProperty.call(config, 'skipOnError')).toBe(true);
    expect(config.skipOnError).toBe(true);
  });
});

describe('Le plafond mord sur l\'adresse, y compris sur des jetons invalides', () => {
  it('refuse le sixième essai d\'une adresse, et laisse son crédit à une autre', async () => {
    const max = (await configDeclaree()).max as number;
    const verdicts = await verdictsParAdresse([
      ['203.0.113.7', max + 1],
      ['198.51.100.4', 1],
    ]);

    // Un jeton invalide répond 400 — et consomme le crédit : c'est
    // exactement la population que ce plafond existe pour freiner.
    expect(verdicts['203.0.113.7'].slice(0, max)).toEqual(Array(max).fill(400));
    expect(verdicts['203.0.113.7'][max]).toBe(429);
    expect(verdicts['198.51.100.4']).toEqual([400]);
  }, 20_000);
});
