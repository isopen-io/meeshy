import { describe, expect, test } from 'bun:test';

import { routedTransport, pathOf } from '@/test-support/routed-transport';

import {
  decodeAdminHourlyActivity,
  decodeAdminKpis,
  decodeAdminLanguageDistribution,
  decodeAdminMessageTypes,
  decodeAdminRealtime,
  decodeAdminUserDistribution,
  decodeAdminVolumeTimeline,
  loadAdminHourlyActivity,
  loadAdminKpis,
  loadAdminLanguageDistribution,
  loadAdminMessageTypes,
  loadAdminRealtime,
  loadAdminUserDistribution,
  loadAdminVolumeTimeline,
} from './admin-overview';

/**
 * **LES LECTURES ANALYTIQUES DU TABLEAU DE BORD** (#8876, § 4) — un décodeur
 * par adresse, champ par champ, forme figée par `toEqual`.
 *
 * Trois règles que chaque témoin mesure :
 * - un champ illisible dit « je ne sais pas » (`null`), jamais zéro — un zéro
 *   fabriqué se lirait comme une mesure ;
 * - une série lue par POSITION ou par INDICE (libellés français servis) ne
 *   garde AUCUN libellé ni couleur servis ;
 * - une charge qui n'est pas de la bonne forme est `null` — l'écran dessine
 *   alors son erreur, pas un graphique plat.
 */

describe('decodeAdminRealtime', () => {
  test('lit les trois compteurs, et rien d’autre', () => {
    expect(
      decodeAdminRealtime({ onlineUsers: 12, messagesLastHour: 340, activeConversations: 27, timestamp: '2026-09-30T10:00:00.000Z' }),
    ).toEqual({ onlineUsers: 12, messagesLastHour: 340, activeConversations: 27 });
  });

  test('un compteur illisible est `null`, jamais zéro', () => {
    expect(decodeAdminRealtime({ onlineUsers: 'beaucoup', messagesLastHour: -4, activeConversations: Number.NaN })).toEqual({
      onlineUsers: null,
      messagesLastHour: null,
      activeConversations: null,
    });
  });

  test('une charge qui n’est pas un objet est illisible', () => {
    expect(decodeAdminRealtime([])).toBeNull();
    expect(decodeAdminRealtime('ok')).toBeNull();
    expect(decodeAdminRealtime(null)).toBeNull();
  });
});

describe('decodeAdminKpis', () => {
  test('lit les quatre taux, JAMAIS la durée de session ni les heures de pointe (codées en dur côté serveur)', () => {
    const kpis = decodeAdminKpis({
      engagementRate: 42,
      avgSessionTime: '2h 45m',
      peakHours: '18h-21h',
      growthRate: 7,
      messagesPerUser: 31,
      activeUserRate: 42,
    });
    expect(kpis).toEqual({ engagementRate: 42, growthRate: 7, messagesPerUser: 31, activeUserRate: 42 });
  });

  test('un taux illisible est `null`', () => {
    expect(decodeAdminKpis({ engagementRate: '42 %' })).toEqual({
      engagementRate: null,
      growthRate: null,
      messagesPerUser: null,
      activeUserRate: null,
    });
  });

  test('un tableau n’est pas une charge de KPIs', () => {
    expect(decodeAdminKpis([{ engagementRate: 1 }])).toBeNull();
  });
});

describe('decodeAdminVolumeTimeline', () => {
  test('rend les volumes PAR POSITION, sans le libellé de jour servi (il est en français)', () => {
    const days = decodeAdminVolumeTimeline([
      { date: 'lun. 24/09', messages: 10 },
      { date: 'mar. 25/09', messages: 0 },
      { date: 'mer. 26/09', messages: 7 },
    ]);
    expect(days).toEqual([10, 0, 7]);
  });

  test('une ligne illisible rend la série illisible : la position est le libellé, on ne la décale pas', () => {
    expect(decodeAdminVolumeTimeline([{ messages: 10 }, { date: 'x', messages: 'sept' }, { messages: 3 }])).toBeNull();
  });

  test('une série vide est une série vide ; autre chose qu’un tableau est illisible', () => {
    expect(decodeAdminVolumeTimeline([])).toEqual([]);
    expect(decodeAdminVolumeTimeline({ messages: 3 })).toBeNull();
  });
});

describe('decodeAdminHourlyActivity', () => {
  test('« 18h » devient l’entier 18 : l’heure se dira dans la langue d’interface', () => {
    expect(
      decodeAdminHourlyActivity([
        { hour: '00h', activity: 4 },
        { hour: '03h', activity: 0 },
        { hour: '21h', activity: 19 },
      ]),
    ).toEqual([
      { startHour: 0, messages: 4 },
      { startHour: 3, messages: 0 },
      { startHour: 21, messages: 19 },
    ]);
  });

  test('une tranche dont l’heure est illisible est ÉCARTÉE, jamais réparée ni devinée', () => {
    expect(
      decodeAdminHourlyActivity([
        { hour: '25h', activity: 1 },
        { hour: 'midi', activity: 2 },
        { hour: '06h', activity: 3 },
        { hour: '09h', activity: 'beaucoup' },
      ]),
    ).toEqual([{ startHour: 6, messages: 3 }]);
  });

  test('autre chose qu’un tableau est illisible', () => {
    expect(decodeAdminHourlyActivity({ hour: '06h', activity: 3 })).toBeNull();
  });
});

describe('decodeAdminUserDistribution', () => {
  test('rend les effectifs PAR INDICE, sans nom ni couleur servis', () => {
    const buckets = decodeAdminUserDistribution([
      { name: 'Très actifs', value: 12, color: '#10b981' },
      { name: 'Actifs', value: 30, color: '#3b82f6' },
      { name: 'Occasionnels', value: 8, color: '#f59e0b' },
      { name: 'Inactifs', value: 50, color: '#ef4444' },
    ]);
    expect(buckets).toEqual([12, 30, 8, 50]);
  });

  test('un effectif illisible rend la répartition illisible : l’indice est le nom', () => {
    expect(decodeAdminUserDistribution([{ value: 1 }, { value: 'x' }, { value: 3 }, { value: 4 }])).toBeNull();
  });

  test('au-delà de quatre tranches, rien n’a de nom : elles sont ignorées', () => {
    expect(decodeAdminUserDistribution([{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }])).toEqual([1, 2, 3, 4]);
  });
});

describe('decodeAdminLanguageDistribution', () => {
  test('lit le code de langue et son effectif — la couleur servie est ignorée', () => {
    expect(
      decodeAdminLanguageDistribution([
        { name: 'fr', value: 900, color: '#8b5cf6' },
        { name: 'en', value: 400, color: '#3b82f6' },
      ]),
    ).toEqual([
      { code: 'fr', count: 900 },
      { code: 'en', count: 400 },
    ]);
  });

  test('une ligne sans code ou sans effectif lisible est écartée', () => {
    expect(decodeAdminLanguageDistribution([{ name: '', value: 3 }, { name: 'de', value: 'x' }, { name: 'es', value: 5 }])).toEqual([
      { code: 'es', count: 5 },
    ]);
  });

  test('autre chose qu’un tableau est illisible', () => {
    expect(decodeAdminLanguageDistribution({ fr: 1 })).toBeNull();
  });
});

describe('decodeAdminMessageTypes', () => {
  test('lit le type et son effectif — le pourcentage servi est arrondi, il se recalcule', () => {
    expect(
      decodeAdminMessageTypes([
        { type: 'text', count: 90, percentage: 90 },
        { type: 'image', count: 10, percentage: 10 },
      ]),
    ).toEqual([
      { type: 'text', count: 90 },
      { type: 'image', count: 10 },
    ]);
  });

  test('une ligne illisible est écartée', () => {
    expect(decodeAdminMessageTypes([{ type: 'audio' }, { count: 4 }, { type: 'file', count: 2 }])).toEqual([{ type: 'file', count: 2 }]);
  });

  test('autre chose qu’un tableau est illisible', () => {
    expect(decodeAdminMessageTypes(null)).toBeNull();
  });
});

describe('les chargeurs visent les bonnes adresses, avec la bonne fenêtre', () => {
  const served = (data: unknown) => () => ({ ok: true as const, data });

  test('chaque chargeur décode la charge servie', async () => {
    const { transport } = routedTransport(
      (req) => (pathOf(req).endsWith('/analytics/realtime') ? { ok: true, data: { onlineUsers: 3, messagesLastHour: 4, activeConversations: 5 } } : undefined),
    );
    const result = await loadAdminRealtime({ source: 'gateway', transport });
    expect(result).toEqual({ ok: true, data: { onlineUsers: 3, messagesLastHour: 4, activeConversations: 5 } });
  });

  test('les KPIs sont demandés sur 30 jours, les langues sur six, les types sur sept jours', async () => {
    const { transport, calls } = routedTransport(served([]));
    await loadAdminKpis({ source: 'gateway', transport });
    await loadAdminLanguageDistribution({ source: 'gateway', transport });
    await loadAdminMessageTypes({ source: 'gateway', transport });
    await loadAdminVolumeTimeline({ source: 'gateway', transport });
    await loadAdminHourlyActivity({ source: 'gateway', transport });
    await loadAdminUserDistribution({ source: 'gateway', transport });

    expect(calls().map((call) => call.path.replace('/api/v1/admin/analytics', ''))).toEqual([
      '/kpis?period=30d',
      '/language-distribution?limit=6',
      '/message-types?period=7d',
      '/volume-timeline',
      '/hourly-activity',
      '/user-distribution',
    ]);
    expect(calls().every((call) => call.method === 'GET')).toBe(true);
  });

  test('un échec du transport est rendu tel quel (statut, message) — l’écran en fait un refus ou une erreur', async () => {
    const { transport } = routedTransport(() => ({ ok: false, status: 403, error: 'Forbidden' }));
    expect(await loadAdminRealtime({ source: 'gateway', transport })).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  test('une charge de la mauvaise forme devient un échec — jamais un succès vide', async () => {
    const { transport } = routedTransport(served('pas du tout ça'));
    const result = await loadAdminVolumeTimeline({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
  });

  test('le signal d’annulation voyage jusqu’au transport', async () => {
    const { transport, calls } = routedTransport(served([]));
    const controller = new AbortController();
    await loadAdminHourlyActivity({ source: 'gateway', transport, signal: controller.signal });
    expect(calls()[0]?.signal).toBe(controller.signal);
  });
});
