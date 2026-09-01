/**
 * Cliquet — aucune `config.rateLimit` du gateway ne peut se TAIRE.
 *
 * ## Pourquoi ce cliquet alors qu'un autre garde déjà les clés de débit
 *
 * `account-keyed-rate-limit-sweep.test.ts` part du `keyGenerator` : il exige
 * de toute config qui lit l'appelant qu'elle pose le hook rendant cette
 * lecture possible. Il ne peut pas voir la faute inverse — **une config qui
 * ne déclare rien**. Un littéral nu n'a ni `keyGenerator` (invisible à ce
 * balayage) ni nom (invisible à toute énumération de fabriques) :
 *
 * | route | littéral |
 * |---|---|
 * | `routes/invitations.ts` | `{ max: 10, timeWindow: '1 hour' }` |
 * | `routes/auth/revoke-all-sessions.ts` | `{ max: 5, timeWindow: '1 minute' }` |
 *
 * Deux sur cinquante, et gardés par rien. `mergeParams` étant un
 * `Object.assign` (`@fastify/rate-limit/index.js:190`), tous deux prenaient la
 * clé des paramètres GLOBAUX — `global:${request.ip}` — donc comptaient par
 * ADRESSE. Le premier voulait manifestement compter un COMPTE ; le second
 * assume l'adresse, mais ne le disait nulle part.
 *
 * ## Ce que ce cliquet exige
 *
 * Une config de route vient d'un NOM (fabrique ou constante partagée, dont le
 * site est relisable et gardé par le balayage voisin), ou elle DÉCLARE `hook`
 * et `keyGenerator` sur place. `rateLimit: false` est une troisième forme,
 * explicite : la route désactive le limiteur du plugin parce qu'elle en monte
 * un autre.
 *
 * ## Une garde négative doit d'abord prouver qu'elle balaie
 *
 * Un cliquet qui affirme « aucun site fautif » est VERT quand son balayage ne
 * trouve rien — y compris parce qu'il est cassé. Le premier `describe` mesure
 * donc le balayage lui-même : combien de fichiers il ouvre, combien
 * d'occurrences il compte, quels sites CONNUS il retrouve, et — la seule
 * preuve qui vaille — qu'il ROUGIT sur une source fabriquée pour être fautive
 * et se TAIT sur la même source corrigée.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { balayerConfigsDeRoute, releverSourceIsolee } from './rate-limit-key-route-config-sweep';

const BALAYAGE = balayerConfigsDeRoute();

const fautives = (): string[] =>
  BALAYAGE.configs.filter((c) => c.conforme === false).map((c) => c.cle).sort();

describe('Le balayage balaie bien ce qu\'il prétend balayer', () => {
  it('ouvre tout le sous-arbre du gateway, pas un répertoire', () => {
    expect(BALAYAGE.fichiersVisites).toBeGreaterThan(400);
  });

  /**
   * La BORNE DE NON-VACUITÉ. `grep -rn 'rateLimit:' src --include=*.ts`
   * (témoins exclus) rendait 50 occurrences le 2026-09-01. Un balayage qui en
   * compterait soudain trois n'accuserait personne — et resterait vert.
   */
  it('compte au moins les cinquante `rateLimit:` de production', () => {
    expect(BALAYAGE.occurrences).toBeGreaterThanOrEqual(50);
    expect(BALAYAGE.configs.length).toBe(BALAYAGE.occurrences);
  });

  /**
   * Les trois FORMES du dépôt, chacune par un site réel. Un détecteur qui
   * n'en reconnaîtrait qu'une mesurerait la popularité d'une écriture, pas
   * une propriété.
   */
  it.each([
    ['routes/posts/sounds.ts', 'nommee', 'appel de fabrique'],
    ['routes/admin/agent-topics.ts', 'nommee', 'constante partagée'],
    ['routes/account-deletion.ts', 'desactivee', 'rateLimit: false'],
    ['middleware/rate-limit.ts', 'litterale', 'littéral, dans la fabrique elle-même'],
  ])('reconnaît %s en forme %s — %s', (fichier, forme) => {
    expect(BALAYAGE.configs.some((c) => c.fichier === fichier && c.forme === forme)).toBe(true);
  });

  /**
   * Les deux routes de #4685, retrouvées par le balayage sous la forme
   * qu'elles portent APRÈS le lot : l'une par un nom, l'autre par un littéral
   * qui déclare. Le cliquet ne saurait pas dire qu'il les a vues sans ça.
   */
  it.each([
    ['routes/invitations.ts', 'nommee'],
    ['routes/auth/revoke-all-sessions.ts', 'litterale'],
  ])('%s est relevée, en forme %s', (fichier, forme) => {
    const vues = BALAYAGE.configs.filter((c) => c.fichier === fichier);
    expect(vues.map((c) => c.forme)).toEqual([forme]);
    expect(vues[0].conforme).toBe(true);
  });

  const LITTERAL_NU = `
    export async function routesNeuves(fastify: FastifyInstance) {
      fastify.post('/geste', {
        config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      }, async () => ({ ok: true }));
    }
  `;

  it('ROUGIT sur un littéral nu fabriqué — la preuve qu\'il peut tomber', () => {
    const trouve = releverSourceIsolee(LITTERAL_NU);
    expect(trouve).toHaveLength(1);
    expect(trouve[0].forme).toBe('litterale');
    expect(trouve[0].conforme).toBe(false);
    expect(trouve[0].cle).toBe('isolee.ts#{max,timeWindow}');
  });

  it('se TAIT sur le même littéral une fois hook et clé déclarés', () => {
    const corrige = LITTERAL_NU.replace(
      "max: 10, timeWindow: '1 hour'",
      "max: 10, timeWindow: '1 hour', hook: 'preHandler' as const, keyGenerator: (r) => r.ip"
    );
    const trouve = releverSourceIsolee(corrige);
    expect(trouve[0].conforme).toBe(true);
  });

  /**
   * Le demi-aveu ne suffit pas : les deux propriétés répondent à deux
   * questions distinctes — QUAND la config compte, et CE QU'elle compte. Une
   * clé posée au mauvais hook lit un `authContext` qui n'existe pas encore
   * (#4347) ; un hook posé sans clé compte toujours l'adresse du global.
   */
  it.each([
    ["hook: 'preHandler' as const", 'clé manquante'],
    ['keyGenerator: (r) => r.ip', 'hook manquant'],
  ])('ROUGIT encore quand seul %s est écrit — %s', (moitie) => {
    const demi = LITTERAL_NU.replace("timeWindow: '1 hour'", `timeWindow: '1 hour', ${moitie}`);
    expect(releverSourceIsolee(demi)[0].conforme).toBe(false);
  });

  /**
   * La résolution d'un nom lit un texte plus large que la config : bornée
   * trop loin, elle absoudrait un littéral nu grâce à la fabrique correcte
   * écrite JUSTE EN DESSOUS. C'est le mode d'échec qui rend un cliquet
   * décoratif sans jamais le faire rougir.
   */
  it('ne déborde pas sur la déclaration voisine', () => {
    const voisinage = `
      export const CONFIG_NUE = { max: 3, timeWindow: '1 minute' };
      export const CONFIG_JUSTE = {
        max: 3,
        timeWindow: '1 minute',
        hook: 'preHandler' as const,
        keyGenerator: (r) => r.ip,
      };
      export async function routes(fastify: FastifyInstance) {
        fastify.post('/a', { config: { rateLimit: CONFIG_NUE } }, async () => ({}));
        fastify.post('/b', { config: { rateLimit: CONFIG_JUSTE } }, async () => ({}));
      }
    `;
    const trouves = releverSourceIsolee(voisinage);
    expect(trouves.map((c) => [c.expression, c.conforme])).toEqual([
      ['CONFIG_NUE', false],
      ['CONFIG_JUSTE', true],
    ]);
  });

  /**
   * Une ENVELOPPE porte le hook sans porter la clé, et l'appel qu'elle
   * enveloppe porte la clé sans porter le hook : c'est l'écriture réelle de
   * `routes/posts/interactions.ts`. Un détecteur qui ne suivrait que le
   * callee accuserait à tort — et un cliquet qui accuse à tort se fait
   * désarmer.
   */
  it('suit une enveloppe ET son argument', () => {
    const enveloppe = `
      export function durcir(config: object): object {
        return { ...config, hook: 'preHandler' as const, skipOnError: false };
      }
      export function cleParCompte(): object {
        return { max: 30, timeWindow: '1 minute', keyGenerator: (r) => r.ip };
      }
      export async function routes(fastify: FastifyInstance) {
        fastify.post('/a', { config: { rateLimit: durcir(cleParCompte()) } }, async () => ({}));
      }
    `;
    const trouves = releverSourceIsolee(enveloppe);
    expect(trouves).toHaveLength(1);
    expect(trouves[0].declareHook).toBe(true);
    expect(trouves[0].declareKeyGenerator).toBe(true);
  });

  it("un `rateLimit: false` n'est pas un silence — il est retenu conforme", () => {
    const desactivee = `
      export async function routes(fastify: FastifyInstance) {
        fastify.post('/a', { config: { rateLimit: false } }, async () => ({}));
      }
    `;
    const trouves = releverSourceIsolee(desactivee);
    expect(trouves.map((c) => [c.forme, c.conforme])).toEqual([['desactivee', true]]);
  });
});

/**
 * La dette est VIDE, et ce tableau reste plutôt que d'être supprimé : c'est un
 * état à DÉFENDRE, pas seulement atteint. Le second `it` rougit si une entrée
 * y était ajoutée sans que la config correspondante soit RÉELLEMENT fautive —
 * une ligne périmée deviendrait sinon une autorisation permanente.
 */
const DETTE: ReadonlyArray<readonly [string, string]> = [];

describe('Toute config de débit vient d\'un nom, ou déclare ce qu\'elle fait', () => {
  it('aucune config de route ne se tait', () => {
    expect(fautives()).toEqual(DETTE.map(([cle]) => cle).sort());
  });

  it('la dette ne porte rien de déjà corrigé, ni rien qui ait disparu', () => {
    const perimees = DETTE.filter(
      ([cle]) => BALAYAGE.configs.find((c) => c.cle === cle)?.conforme !== false
    ).map(([cle]) => cle);

    expect(perimees).toEqual([]);
  });
});
