import { beforeAll, describe, expect, test } from 'bun:test';

import { decodeAdminMonitoring, decodeAdminRouteUsage } from '@/lib/api/admin-monitoring';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { BLIND_SPOTS, servedMonitoring, servedRouteUsage, servedUsageEntry, servedWatched } from './monitoring-fixtures';
import {
  blindSpotOf,
  breakerStateOf,
  healthIssuesOf,
  megabytesToBytes,
  routePlatformLabel,
  routeVerdictOf,
  routeVersionLabel,
} from './monitoring-view';

beforeAll(async () => {
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en')]);
});

const monitoring = (overrides: Record<string, unknown> = {}) => {
  const decoded = decodeAdminMonitoring(servedMonitoring(overrides));
  if (decoded === null) throw new Error('charge illisible');
  return decoded;
};

describe('ce qui ne va pas — dit dans l’ordre où on le traite', () => {
  test('tout va bien : aucune alerte', () => {
    const healthy = monitoring({ circuitBreakers: [{ name: 'translator-zmq', state: 'CLOSED', failures: 0, successes: 10, lastFailureAt: null }] });
    expect(healthIssuesOf(healthy, 'fr')).toEqual([]);
  });

  test('une base ou Redis qui ne répondent pas sont en danger, avec leur mot', () => {
    const down = monitoring({ database: { status: 'down', latencyMs: null }, redis: { status: 'down', latencyMs: null }, circuitBreakers: [] });

    expect(healthIssuesOf(down, 'fr')).toEqual([
      { id: 'database', tone: 'danger', text: 'La base de données ne répond pas.' },
      { id: 'redis', tone: 'danger', text: 'Redis ne répond pas : le cache et les limites de débit sont dégradés.' },
    ]);
  });

  test('un état inconnu n’est pas « opérationnel » : fail-closed', () => {
    const odd = monitoring({ database: { status: '', latencyMs: null }, circuitBreakers: [] });
    expect(healthIssuesOf(odd, 'fr').map((entry) => entry.id)).toEqual(['database']);
  });

  test('un traducteur injoignable est une alerte ; un coupe-circuit OUVERT est en danger, un en essai en alerte', () => {
    const issues = healthIssuesOf(monitoring({ translator: null }), 'fr');

    expect(issues).toEqual([
      { id: 'translator', tone: 'warning', text: 'Le service de traduction est injoignable.' },
      { id: 'breakersOpen', tone: 'danger', text: 'Coupe-circuits ouverts : 1. Les appels vers ces services sont refusés.' },
      { id: 'breakersHalfOpen', tone: 'warning', text: 'Coupe-circuits en essai : 1. Ils laissent passer quelques appels pour vérifier que le service est rétabli.' },
    ]);
  });

  test('la même lecture se dit en anglais', () => {
    expect(healthIssuesOf(monitoring({ translator: null, circuitBreakers: [] }), 'en')[0]?.text).toBe('The translation service is unreachable.');
  });
});

describe('un coupe-circuit — le mot d’abord', () => {
  test('ouvert : « Coupé », en danger, et l’explication dit ce que cela change', () => {
    const open = breakerStateOf('OPEN', 'fr');

    expect(open).toMatchObject({ label: 'Coupé', tone: 'danger' });
    expect(open.explain).toContain('refusés');
  });

  test('fermé : « Normal » ; en essai : « En essai »', () => {
    expect(breakerStateOf('CLOSED', 'fr')).toMatchObject({ label: 'Normal', tone: 'success' });
    expect(breakerStateOf('HALF_OPEN', 'fr')).toMatchObject({ label: 'En essai', tone: 'warning' });
  });

  test('un état inconnu se dit « Non reconnu », jamais le code brut', () => {
    expect(breakerStateOf('EXPLODED', 'fr')).toMatchObject({ label: 'Non reconnu', raw: 'EXPLODED' });
  });
});

describe('le verdict d’une route surveillée — ce qu’un zéro vaut', () => {
  const verdict = (overrides: Record<string, unknown>) => {
    const usage = decodeAdminRouteUsage(servedRouteUsage({ watched: [servedWatched(overrides)] }));
    const route = usage?.watched[0];
    if (route === undefined) throw new Error('route absente');
    return routeVerdictOf(route, 'fr');
  };

  test('montée, observée, jamais appelée : le seul vert — « Jamais appelée »', () => {
    expect(verdict({ matched: true, count: 0 })).toMatchObject({ label: 'Jamais appelée', tone: 'success', raw: 'unused' });
  });

  test('encore appelée : en alerte, il ne faut pas la retirer', () => {
    const still = verdict({ matched: true, count: 37 });

    expect(still).toMatchObject({ label: 'Encore appelée', tone: 'warning', raw: 'used' });
    expect(still.explain).toContain('ne la retirez pas');
  });

  test('une adresse qui n’est plus montée a un zéro qui ne prouve RIEN : jamais un faux vert', () => {
    const gone = verdict({ matched: false, count: 0 });

    expect(gone).toMatchObject({ label: 'Adresse introuvable', tone: 'warning', raw: 'unmounted' });
    expect(gone.explain).toContain('ne prouve rien');
  });

  test('pas encore confrontée à la table de routage : neutre, « Non vérifiée »', () => {
    expect(verdict({ matched: null, count: 0 })).toMatchObject({ label: 'Non vérifiée', tone: 'neutral', raw: 'unchecked' });
  });
});

describe('plateforme et version — des mots, pas des codes', () => {
  const entry = (overrides: Record<string, unknown>) => {
    const usage = decodeAdminRouteUsage(servedRouteUsage({ entries: [servedUsageEntry(overrides)] }));
    const row = usage?.entries[0];
    if (row === undefined) throw new Error('entrée absente');
    return row;
  };

  test('les plateformes connues se nomment', () => {
    expect(routePlatformLabel(entry({ platform: 'ios' }), 'fr')).toBe('iPhone / iPad');
    expect(routePlatformLabel(entry({ platform: 'android' }), 'fr')).toBe('Android');
    expect(routePlatformLabel(entry({ platform: 'web' }), 'fr')).toBe('Navigateur');
  });

  test('les verdicts servis se disent : non déclarée, robot, script, autre', () => {
    expect(routePlatformLabel(entry({ platform: 'absent' }), 'fr')).toBe('Non déclarée');
    expect(routePlatformLabel(entry({ platform: 'bot' }), 'fr')).toBe('Robot d’indexation');
    expect(routePlatformLabel(entry({ platform: 'script' }), 'fr')).toBe('Script ou outil en ligne de commande');
    expect(routePlatformLabel(entry({ platform: 'other' }), 'fr')).toBe('Autre');
  });

  test('le seau TOTAL d’une route surveillée dit « toutes plateformes » et « toutes versions »', () => {
    const total = entry({ platform: '*', version: '*', total: true });

    expect(routePlatformLabel(total, 'fr')).toBe('Toutes plateformes');
    expect(routeVersionLabel(total, 'fr')).toBe('Toutes versions');
  });

  test('une version lisible s’écrit telle quelle ; absente et illisible se disent', () => {
    expect(routeVersionLabel(entry({ version: '2.4.0' }), 'fr')).toBe('2.4.0');
    expect(routeVersionLabel(entry({ version: 'absent' }), 'fr')).toBe('Non communiquée');
    expect(routeVersionLabel(entry({ version: 'invalid' }), 'fr')).toBe('Illisible');
  });
});

describe('les angles morts — traduits, jamais le code servi', () => {
  test('les six angles morts connus ont un titre et une phrase dans la langue d’interface', () => {
    const views = BLIND_SPOTS.map((served) => blindSpotOf(served, 'fr'));

    expect(views.map((view) => view.title)).toEqual([
      'Web et Android n’envoient pas leur version',
      'Mesure en mémoire, par instance',
      'Réponses servies depuis un cache',
      'Temps réel non mesuré',
      'Routes déjà retirées',
      'Ventilation limitée sous saturation',
    ]);
    for (const view of views) expect(view.explain).not.toMatch(/^[a-z-]+ : /);
    expect(views[0]?.explain).toContain('Seul iOS annonce sa version');
  });

  test('un angle mort que cette version ne connaît pas garde la phrase servie, sous un titre neutre', () => {
    expect(blindSpotOf('nouvelle-limite : une phrase inédite', 'fr')).toEqual({
      id: 'nouvelle-limite',
      title: 'Autre limite signalée',
      explain: 'nouvelle-limite : une phrase inédite',
    });
  });

  test('en anglais, les mêmes titres', () => {
    expect(blindSpotOf(BLIND_SPOTS[3] ?? '', 'en').title).toBe('Real time not measured');
  });
});

test('la mémoire du traducteur est servie en mégaoctets : elle se convertit en octets avant d’être formatée', () => {
  expect(megabytesToBytes(150)).toBe(157_286_400);
});
