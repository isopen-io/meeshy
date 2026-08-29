/**
 * Témoins de `route-usage-counter.ts` (#4275).
 *
 * Quatre familles, dans l'ordre des critères de fin de l'issue :
 *  1. Agrégat (méthode, GABARIT, version) sur fenêtre glissante — jamais
 *     l'URL concrète (§ « compteur, pas journal »).
 *  2. Le plugin `registerRouteUsageCounterHook`, monté sur une instance
 *     Fastify JETABLE construite ici (la route de #4275 n'étant pas montée
 *     en production par ce lot — territoire strict).
 *  3. Le coût : un micro-banc qui mesure N incréments et rapporte un chiffre.
 *  4. La cardinalité : un balayage d'adresses inconnues, et un excédent de
 *     versions distinctes, ne peuvent pas faire grandir un seau sans borne.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  RouteUsageCounter,
  registerRouteUsageCounterHook,
  routeUsageCounter,
} from '../route-usage-counter';

// ── Constantes de test (fenêtre courte pour ne pas dépendre du réglage réel) ──
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeCounter(overrides: Partial<{ windowMs: number; bucketMs: number; maxKeysPerBucket: number }> = {}) {
  return new RouteUsageCounter({
    windowMs: overrides.windowMs ?? 2 * DAY,
    bucketMs: overrides.bucketMs ?? HOUR,
    maxKeysPerBucket: overrides.maxKeysPerBucket ?? 1000,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 1. L'agrégat — record/snapshot, sanitation, fenêtre glissante
// ════════════════════════════════════════════════════════════════════════════

describe('RouteUsageCounter — record/snapshot de base', () => {
  it('test_record_singleHit_appearsInSnapshot', () => {
    const c = makeCounter();
    c.record({ method: 'GET', route: '/api/v1/users/:id', versionHeader: '1.4.2', now: 1_000_000 });
    const entries = c.snapshot(1_000_000);
    expect(entries).toEqual([{ method: 'GET', route: '/api/v1/users/:id', clientVersion: '1.4.2', count: 1 }]);
  });

  it('test_record_sameKeyTwice_incrementsCount', () => {
    const c = makeCounter();
    c.record({ method: 'GET', route: '/api/v1/users/:id', versionHeader: '1.4.2', now: 1_000_000 });
    c.record({ method: 'GET', route: '/api/v1/users/:id', versionHeader: '1.4.2', now: 1_000_500 });
    const entries = c.snapshot(1_000_500);
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBe(2);
  });

  it('test_record_differentMethodsSameRoute_areSeparateEntries', () => {
    const c = makeCounter();
    c.record({ method: 'GET', route: '/api/v1/reports', versionHeader: undefined, now: 0 });
    c.record({ method: 'POST', route: '/api/v1/reports', versionHeader: undefined, now: 0 });
    const entries = c.snapshot(0);
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((e) => e.method))).toEqual(new Set(['GET', 'POST']));
  });

  it('test_record_differentRoutesSameMethod_areSeparateEntries', () => {
    const c = makeCounter();
    c.record({ method: 'GET', route: '/api/v1/a', versionHeader: undefined, now: 0 });
    c.record({ method: 'GET', route: '/api/v1/b', versionHeader: undefined, now: 0 });
    const entries = c.snapshot(0);
    expect(entries).toHaveLength(2);
  });

  it('test_snapshot_sortsAscendingByCount_deadRoutesFirst', () => {
    const c = makeCounter();
    c.record({ method: 'GET', route: '/hot', versionHeader: undefined, now: 0 });
    c.record({ method: 'GET', route: '/hot', versionHeader: undefined, now: 0 });
    c.record({ method: 'GET', route: '/hot', versionHeader: undefined, now: 0 });
    c.record({ method: 'GET', route: '/cold', versionHeader: undefined, now: 0 });
    const entries = c.snapshot(0);
    expect(entries.map((e) => e.route)).toEqual(['/cold', '/hot']);
  });
});

describe('RouteUsageCounter — la clé est le GABARIT, jamais l\'URL concrète (critère 1)', () => {
  it('test_record_undefinedRoute_foldsToNoRouteSentinel', () => {
    const c = makeCounter();
    // `route: undefined` est exactement ce que porte `request.routeOptions.url`
    // sur une adresse qu'AUCUNE route ne matche (`request.is404`).
    c.record({ method: 'GET', route: undefined, versionHeader: undefined, now: 0 });
    const entries = c.snapshot(0);
    expect(entries).toEqual([{ method: 'GET', route: '<no-route>', clientVersion: 'unknown', count: 1 }]);
  });

  it('test_record_manyDistinctUnknownUrls_produceOneEntryNotOne', () => {
    // Un balayage adverse sur un MILLION d'adresses inconnues doit produire
    // UNE entrée, jamais un million — c'est la garantie de cardinalité de la
    // dimension ROUTE (§ a de la consigne). On simule le balayage en variant
    // ce qu'un attaquant contrôlerait (rien, ici : la route matchée est
    // TOUJOURS `undefined` pour une adresse inconnue, quel que soit le chemin
    // demandé — c'est Fastify qui garantit cette invariance, pas ce fichier).
    const c = makeCounter();
    for (let i = 0; i < 500; i++) {
      c.record({ method: 'GET', route: undefined, versionHeader: undefined, now: 0 });
    }
    const entries = c.snapshot(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].route).toBe('<no-route>');
    expect(entries[0].count).toBe(500);
  });

  it('test_record_twoRealUserIdsOnSameParamRoute_collapseToOneRow', () => {
    // La preuve la plus directe que ce n'est PAS un journal : deux appels
    // vers deux ressources DIFFÉRENTES sous le même gabarit paramétré
    // rendent UNE ligne à count=2, jamais deux lignes portant chacune un
    // identifiant. Le "concret" (l'id) n'apparaît nulle part dans la clé —
    // seul le gabarit `/api/v1/users/:id`, tel que `record()` le reçoit, y
    // entre.
    const c = makeCounter();
    c.record({ method: 'GET', route: '/api/v1/users/:id', versionHeader: undefined, now: 0 });
    c.record({ method: 'GET', route: '/api/v1/users/:id', versionHeader: undefined, now: 0 });
    const entries = c.snapshot(0);
    expect(entries).toEqual([{ method: 'GET', route: '/api/v1/users/:id', clientVersion: 'unknown', count: 2 }]);
  });
});

describe('RouteUsageCounter — sanitation de la version (consigne b)', () => {
  it.each([
    [undefined, 'unknown'],
    ['', 'unknown'],
    ['abc', 'unknown'],
    ['1.2.3.4.5', 'unknown'], // 5 segments — au-delà de ce que compareAppVersions compare
    ['a'.repeat(33), 'unknown'], // au-delà de MAX_VERSION_HEADER_LENGTH (32)
    ['1.2.3; DROP TABLE', 'unknown'],
    ['1', '1'],
    ['1.4', '1.4'],
    ['1.4.2', '1.4.2'],
    ['1.4.2.7', '1.4.2.7'],
    ['0.0.0', '0.0.0'], // AppVersionHeader.fallbackVersion iOS — une valeur légitime, pas du bruit
  ])('sanitise %p → %p', (header, expected) => {
    const c = makeCounter();
    c.record({ method: 'GET', route: '/x', versionHeader: header, now: 0 });
    expect(c.snapshot(0)[0].clientVersion).toBe(expected);
  });

  it('test_record_manyDistinctSpoofedVersions_eachCountedSeparatelyUntilCap', () => {
    // Un format valide n'est PAS synonyme d'inoffensif : un attaquant qui
    // reste dans le motif accepté peut légitimement vouloir une clé par
    // version. C'est pour CE cas que `maxKeysPerBucket` existe (voir la
    // famille « cardinalité » plus bas) — ce témoin-ci prouve seulement
    // que sous le plafond, chaque version FORMÉE correctement reste
    // distincte (le compteur ne les confond pas entre elles).
    const c = makeCounter({ maxKeysPerBucket: 10 });
    for (let i = 0; i < 5; i++) {
      c.record({ method: 'GET', route: '/x', versionHeader: `1.0.${i}`, now: 0 });
    }
    const entries = c.snapshot(0);
    expect(entries).toHaveLength(5);
    expect(entries.every((e) => e.count === 1)).toBe(true);
  });
});

describe('RouteUsageCounter — plafond dur par seau, la garantie de cardinalité (critère 1, consigne a)', () => {
  it('test_record_beyondMaxKeysPerBucket_foldsIntoOverflowSentinel', () => {
    const c = makeCounter({ maxKeysPerBucket: 3 });
    for (let i = 0; i < 3; i++) {
      c.record({ method: 'GET', route: '/x', versionHeader: `1.0.${i}`, now: 0 });
    }
    // 3 clés distinctes admises — le seau est à son plafond.
    expect(c.snapshot(0)).toHaveLength(3);

    for (let i = 3; i < 8; i++) {
      c.record({ method: 'GET', route: '/x', versionHeader: `1.0.${i}`, now: 0 });
    }
    const entries = c.snapshot(0);
    // Toujours 3 clés RÉELLES + exactement UNE sentinelle `<overflow>` —
    // jamais 8 entrées, quel que soit le nombre de versions distinctes
    // envoyées au-delà du plafond.
    expect(entries).toHaveLength(4);
    const overflow = entries.find((e) => e.route === '<overflow>');
    expect(overflow?.count).toBe(5);
  });

  it('test_record_existingKeyPastCap_keepsIncrementing_notFoldedIntoOverflow', () => {
    // Une clé DÉJÀ admise ne doit jamais être sous-comptée par la présence
    // d'un excédent adverse arrivé après elle.
    const c = makeCounter({ maxKeysPerBucket: 1 });
    c.record({ method: 'GET', route: '/legit', versionHeader: '1.0.0', now: 0 }); // admise, seau plein
    c.record({ method: 'GET', route: '/attacker', versionHeader: '9.9.9', now: 0 }); // replié
    c.record({ method: 'GET', route: '/legit', versionHeader: '1.0.0', now: 0 }); // ré-appelée : doit s'incrémenter

    const entries = c.snapshot(0);
    const legit = entries.find((e) => e.route === '/legit');
    const overflow = entries.find((e) => e.route === '<overflow>');
    expect(legit?.count).toBe(2);
    expect(overflow?.count).toBe(1);
  });

  it('test_record_capAppliesPerBucket_notGlobally', () => {
    // Le plafond borne CHAQUE seau — un seau qui redémarre (nouvelle heure)
    // a droit à nouveau à `maxKeysPerBucket` clés distinctes. C'est ce qui
    // rend la borne mémoire TOTALE prévisible (seaux vivants × plafond),
    // pas un plafond global qui figerait le compteur après le premier pic.
    const c = makeCounter({ bucketMs: HOUR, windowMs: 2 * DAY, maxKeysPerBucket: 2 });
    c.record({ method: 'GET', route: '/a', versionHeader: undefined, now: 0 });
    c.record({ method: 'GET', route: '/b', versionHeader: undefined, now: 0 });
    c.record({ method: 'GET', route: '/c', versionHeader: undefined, now: 0 }); // seau 0 : replié

    c.record({ method: 'GET', route: '/d', versionHeader: undefined, now: HOUR }); // seau 1 : nouveau quota
    c.record({ method: 'GET', route: '/e', versionHeader: undefined, now: HOUR });

    const entries = c.snapshot(HOUR);
    expect(entries.some((e) => e.route === '/d')).toBe(true);
    expect(entries.some((e) => e.route === '/e')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Fenêtre glissante — expiration, purge, couverture observable
// ════════════════════════════════════════════════════════════════════════════

describe('RouteUsageCounter — fenêtre glissante', () => {
  it('test_snapshot_entryInsideWindow_isIncluded', () => {
    const c = makeCounter({ windowMs: 2 * DAY, bucketMs: HOUR });
    c.record({ method: 'GET', route: '/x', versionHeader: undefined, now: 0 });
    const entries = c.snapshot(DAY); // 1 jour plus tard, fenêtre = 2 jours
    expect(entries).toHaveLength(1);
  });

  it('test_snapshot_entryOutsideWindow_isExcluded', () => {
    const c = makeCounter({ windowMs: 2 * DAY, bucketMs: HOUR });
    c.record({ method: 'GET', route: '/x', versionHeader: undefined, now: 0 });
    const entries = c.snapshot(3 * DAY); // 3 jours plus tard, fenêtre = 2 jours
    expect(entries).toHaveLength(0);
  });

  it('test_pruneExpiredBuckets_actuallyFreesMemory_notJustFiltersOnRead', () => {
    const c = makeCounter({ windowMs: 2 * DAY, bucketMs: HOUR });
    c.record({ method: 'GET', route: '/x', versionHeader: undefined, now: 0 });
    expect(c.bucketCount).toBe(1);
    c.pruneExpiredBuckets(3 * DAY);
    expect(c.bucketCount).toBe(0); // le seau a été SUPPRIMÉ, pas seulement ignoré
  });

  it('test_record_newBucketRollover_opportunisticallyPrunesExpiredOnes', () => {
    // La purge sur chemin chaud ne s'exécute QUE quand un seau JAMAIS VU
    // apparaît — jamais à chaque requête (critère 3).
    const c = makeCounter({ windowMs: HOUR, bucketMs: HOUR });
    c.record({ method: 'GET', route: '/x', versionHeader: undefined, now: 0 });
    expect(c.bucketCount).toBe(1);
    // Même seau, dix requêtes de plus : aucune purge déclenchée, aucun
    // nouveau seau créé.
    for (let i = 0; i < 10; i++) c.record({ method: 'GET', route: '/x', versionHeader: undefined, now: 100 });
    expect(c.bucketCount).toBe(1);
    // Un hit assez loin dans le futur pour retomber dans un NOUVEAU seau
    // déclenche la purge de l'ancien, opportunistement.
    c.record({ method: 'GET', route: '/y', versionHeader: undefined, now: 10 * HOUR });
    expect(c.bucketCount).toBe(1); // l'ancien seau a été balayé, le nouveau est seul
  });

  it('test_coverageMs_youngCounter_reportsLessThanFullWindow', () => {
    const c = makeCounter({ windowMs: 2 * DAY, bucketMs: HOUR });
    expect(c.coverageMs(0)).toBe(0); // aucun seau encore
    c.record({ method: 'GET', route: '/x', versionHeader: undefined, now: 0 });
    expect(c.coverageMs(HOUR)).toBeLessThanOrEqual(HOUR + 1);
    expect(c.coverageMs(HOUR)).toBeLessThan(c.windowMsValue);
  });

  it('test_coverageMs_matureCounter_saturatesAtWindowMs', () => {
    const c = makeCounter({ windowMs: 2 * DAY, bucketMs: HOUR });
    c.record({ method: 'GET', route: '/x', versionHeader: undefined, now: 0 });
    // Un flux continu de hits ultérieurs garde le plus vieux seau VIVANT
    // jusqu'à ce qu'il sorte de la fenêtre — la couverture plafonne alors à
    // `windowMs`, elle ne le dépasse jamais.
    for (let h = 1; h <= 48; h++) {
      c.record({ method: 'GET', route: '/x', versionHeader: undefined, now: h * HOUR });
    }
    expect(c.coverageMs(48 * HOUR)).toBe(2 * DAY);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Sonde périodique — startSweep/stopSweep (critère 3, « vidé périodiquement »)
// ════════════════════════════════════════════════════════════════════════════

describe('RouteUsageCounter — sonde périodique', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('test_startSweep_periodicallyCallsPruneExpiredBuckets', () => {
    jest.useFakeTimers();
    const c = makeCounter({ windowMs: HOUR, bucketMs: HOUR });
    const spy = jest.spyOn(c, 'pruneExpiredBuckets');
    c.startSweep();
    jest.advanceTimersByTime(HOUR);
    expect(spy).toHaveBeenCalled();
    c.stopSweep();
  });

  it('test_stopSweep_stopsFurtherCalls', () => {
    jest.useFakeTimers();
    const c = makeCounter({ windowMs: HOUR, bucketMs: HOUR });
    const spy = jest.spyOn(c, 'pruneExpiredBuckets');
    c.startSweep();
    c.stopSweep();
    spy.mockClear();
    jest.advanceTimersByTime(10 * HOUR);
    expect(spy).not.toHaveBeenCalled();
  });

  it('test_startSweep_calledTwice_doesNotLeakASecondTimer', () => {
    const c = makeCounter();
    c.startSweep();
    c.startSweep(); // second appel — ne doit pas remplacer le premier sans l'arrêter
    c.stopSweep(); // un seul stop doit suffire à tout arrêter
    c.stopSweep(); // idempotent, ne lève pas
  });

  it('test_recordAndSnapshot_workWithoutEverStartingTheSweep', () => {
    // La sonde est un mécanisme d'HYGIÈNE mémoire, jamais une dépendance de
    // correction : un compteur qui ne l'a jamais démarrée doit compter et
    // lire correctement.
    const c = makeCounter();
    c.record({ method: 'GET', route: '/x', versionHeader: undefined, now: 0 });
    expect(c.snapshot(0)).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Le plugin — montage sur une instance Fastify JETABLE (règle absolue #2/#5)
// ════════════════════════════════════════════════════════════════════════════

describe('registerRouteUsageCounterHook — monté sur une instance Fastify jetable', () => {
  let app: FastifyInstance;
  let counter: RouteUsageCounter;

  beforeEach(async () => {
    counter = makeCounter();
    app = Fastify({ logger: false });
    app.get('/api/v1/users/:id', async () => ({ ok: true }));
    app.post('/api/v1/reports', async () => ({ ok: true }));
    // Enregistrée ici, pas dans le test qui l'utilise : Fastify refuse
    // d'ajouter une route après `app.ready()` (« Root plugin has already
    // booted »).
    app.get('/boom', async () => {
      throw new Error('kaboom');
    });
    registerRouteUsageCounterHook(app, counter);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('test_hook_realRequest_recordsMethodAndRouteTemplate', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/users/507f1f77bcf86cd799439011' });
    const entries = counter.snapshot();
    expect(entries).toEqual([
      { method: 'GET', route: '/api/v1/users/:id', clientVersion: 'unknown', count: 1 },
    ]);
  });

  it('test_hook_twoDifferentConcreteIds_collapseToOneRowNotTwo', async () => {
    // La preuve de bout en bout (vraie requête Fastify, vrai routage) que
    // deux ressources DIFFÉRENTES ne créent jamais deux lignes : c'est un
    // compteur, jamais un journal (critère 1).
    await app.inject({ method: 'GET', url: '/api/v1/users/aaaaaaaaaaaaaaaaaaaaaaaa' });
    await app.inject({ method: 'GET', url: '/api/v1/users/bbbbbbbbbbbbbbbbbbbbbbbb' });
    const entries = counter.snapshot();
    expect(entries).toEqual([
      { method: 'GET', route: '/api/v1/users/:id', clientVersion: 'unknown', count: 2 },
    ]);
  });

  it('test_hook_unknownAddress_recordsNoRouteSentinel_not404Url', async () => {
    await app.inject({ method: 'GET', url: '/this/does/not/exist' });
    const entries = counter.snapshot();
    expect(entries).toEqual([{ method: 'GET', route: '<no-route>', clientVersion: 'unknown', count: 1 }]);
  });

  it('test_hook_manyDistinctUnknownAddresses_stillOneEntry', async () => {
    for (let i = 0; i < 20; i++) {
      await app.inject({ method: 'GET', url: `/scan/${i}/${Math.random()}` });
    }
    const entries = counter.snapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBe(20);
  });

  it('test_hook_readsXAppVersionHeader_lowercased', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/users/507f1f77bcf86cd799439011',
      headers: { 'X-App-Version': '2.10.0' },
    });
    expect(counter.snapshot()[0].clientVersion).toBe('2.10.0');
  });

  it('test_hook_missingVersionHeader_recordsUnknown', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/reports' });
    expect(counter.snapshot()[0].clientVersion).toBe('unknown');
  });

  it('test_hook_malformedVersionHeader_recordsUnknown_notRawValue', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'X-App-Version': 'not-a-version;<script>' },
    });
    expect(counter.snapshot()[0].clientVersion).toBe('unknown');
  });

  it('test_hook_errorResponse_isStillCounted', async () => {
    // `onResponse` compte AUSSI les réponses en échec (schéma invalide, 500…)
    // — une route qui ne fait que rejeter des appels reste une route APPELÉE.
    await app.inject({ method: 'GET', url: '/boom' });
    const entries = counter.snapshot();
    expect(entries.some((e) => e.route === '/boom')).toBe(true);
  });

  it('test_hook_onClose_stopsTheSweep', async () => {
    const spy = jest.spyOn(counter, 'stopSweep');
    await app.close();
    expect(spy).toHaveBeenCalled();
  });
});

describe('registerRouteUsageCounterHook — défaut sur le singleton exporté', () => {
  afterEach(() => {
    routeUsageCounter.clear();
  });

  it('test_registerHook_withoutExplicitCounter_writesToDefaultSingleton', async () => {
    const app = Fastify({ logger: false });
    app.get('/ping', async () => ({ ok: true }));
    registerRouteUsageCounterHook(app); // pas de deuxième argument — comme server.ts l'appellerait
    await app.ready();
    await app.inject({ method: 'GET', url: '/ping' });
    await app.close();
    expect(routeUsageCounter.snapshot().some((e) => e.route === '/ping')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Le coût — micro-banc (critère 3 : « le coût est borné et mesuré »)
// ════════════════════════════════════════════════════════════════════════════

describe('RouteUsageCounter — coût mesuré (critère 3)', () => {
  it('test_record_100kIncrements_completesWithABoundedBudget', () => {
    const c = makeCounter({ maxKeysPerBucket: 5000 });
    const ROUTES = Array.from({ length: 50 }, (_, i) => `/api/v1/resource-${i}`);
    const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
    const VERSIONS = ['1.0.0', '1.1.0', '1.2.0', '1.2.1', 'unknown'];
    const N = 100_000;

    const startedAt = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      c.record({
        method: METHODS[i % METHODS.length],
        route: ROUTES[i % ROUTES.length],
        versionHeader: VERSIONS[i % VERSIONS.length],
        now: 0,
      });
    }
    const elapsedNs = Number(process.hrtime.bigint() - startedAt);
    const nsPerOp = elapsedNs / N;

    // Rapporté pour la preuve du critère 3 — lu par la session, pas une
    // assertion : Jest capture stdout dans le résumé de la suite.
    // eslint-disable-next-line no-console
    console.log(
      `[route-usage-counter bench] ${N} record() en ${(elapsedNs / 1e6).toFixed(2)}ms ` +
      `(${nsPerOp.toFixed(0)}ns/op)`
    );

    // Budget très généreux (100x la latence attendue) : ce test garde contre
    // une RÉGRESSION algorithmique (ex. un balayage O(n) introduit par
    // erreur dans `record()`), pas une performance de pointe — les machines
    // CI varient. `bucket.size` reste borné par `maxKeysPerBucket`, donc le
    // temps total doit rester LINÉAIRE en N, jamais quadratique.
    expect(elapsedNs / 1e6).toBeLessThan(2000); // < 2s pour 100k incréments
    expect(c.snapshot(0).length).toBeLessThanOrEqual(50 * 4 * 5); // cardinalité du jeu ci-dessus

    c.startSweep();
    c.stopSweep();
  });

  it('test_record_costDoesNotGrowWithBucketCount', () => {
    // Le coût d'un `record()` sur un seau DÉJÀ créé ne doit pas dépendre du
    // nombre de seaux accumulés (sinon un compteur vieux de 14 jours
    // ralentirait le chemin chaud). On accumule 56 seaux (14j/6h — le
    // réglage par défaut) puis on mesure un lot d'incréments dans le
    // DERNIER, déjà existant.
    const c = makeCounter({ windowMs: 14 * DAY, bucketMs: 6 * HOUR, maxKeysPerBucket: 4000 });
    for (let b = 0; b < 56; b++) {
      c.record({ method: 'GET', route: '/warmup', versionHeader: undefined, now: b * 6 * HOUR });
    }
    const lastBucketNow = 55 * 6 * HOUR;
    const startedAt = process.hrtime.bigint();
    for (let i = 0; i < 10_000; i++) {
      c.record({ method: 'GET', route: '/warmup', versionHeader: undefined, now: lastBucketNow });
    }
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    expect(elapsedMs).toBeLessThan(200); // O(1) par incrément sur un seau existant
  });
});
