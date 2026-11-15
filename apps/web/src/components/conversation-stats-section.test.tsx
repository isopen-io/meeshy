import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { conversationStatsQueryKey, decodeConversationStats } from '@/lib/api/conversation-stats';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationStatsSection } from './conversation-stats-section';

/**
 * **LA FEUILLE DE DÉTAILS MONTRE LES STATISTIQUES DE LA CONVERSATION** (#7835)
 * — miroir de l'onglet Stats de `ConversationInfoSheet.swift`
 * (`ConversationDashboardView`) : les compteurs, l'activité par période, les
 * participants les plus actifs et les langues, servis par la passerelle.
 * Cache d'abord, états dessinés (chargement, erreur, vide, hors ligne).
 */

const STATS = 'GET /api/v1/conversations/c1/stats';

const wire = (overrides: Record<string, unknown> = {}) => ({
  conversationId: 'c1',
  totalMessages: 42,
  totalWords: 310,
  contentTypes: { text: 30, image: 5, audio: 3, video: 2, file: 1, location: 1 },
  participantStats: [
    { userId: 'u-sam', username: 'sam', displayName: 'Sam Kim', avatar: null, messageCount: 12, wordCount: 110 },
    { userId: 'u-nour', username: 'nour', displayName: 'Nour Haddad', avatar: null, messageCount: 30, wordCount: 200 },
  ],
  dailyActivity: [
    { date: '2026-10-12', count: 3 },
    { date: '2026-10-13', count: 5 },
  ],
  languageDistribution: [
    { language: 'fr', count: 30 },
    { language: 'en', count: 10 },
  ],
  ...overrides,
});

const served = (data: unknown): ApiResult<unknown> => ({ ok: true, data }) as ApiResult<unknown>;

const transportOf = (replies: Readonly<Record<string, ApiResult<unknown> | 'pending'>>) => {
  const calls: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: '' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    calls.push(req);
    const reply = replies[`${req.method} ${req.path}`];
    if (reply === 'pending') return new Promise(() => {});
    return reply ?? { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  }) as HttpTransport['request'];
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { deps, calls: () => calls };
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

const settle = (ms = 10) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const until = async (check: () => boolean) => {
  for (let tries = 0; tries < 100 && !check(); tries += 1) await settle(20);
};

const mount = (options: { readonly replies: Readonly<Record<string, ApiResult<unknown> | 'pending'>>; readonly client?: QueryClient }) => {
  const { deps, calls } = transportOf(options.replies);
  const client = options.client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <ConversationStatsSection conversationId="c1" deps={deps} today="2026-10-13" />
      </QueryClientProvider>,
    );
  });
  return { calls, client };
};

const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const text = (selector: string) => $(selector)?.textContent ?? '';

const click = (element: HTMLElement | null) => {
  if (element === null) throw new Error('élément introuvable');
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const offline = () => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });

describe('ce que la section montre', () => {
  test('les compteurs d’iOS : messages, mots, photos, audio, vidéos, documents', async () => {
    mount({ replies: { [STATS]: served(wire()) } });
    await until(() => $('[data-conversation-stats-counters]') !== null);
    const counters = $$('[data-conversation-stat]').map((node) => [node.dataset.conversationStat, node.textContent]);
    expect(counters).toEqual([
      ['messages', '42Messages'],
      ['words', '310Mots'],
      ['photos', '5Photos'],
      ['audio', '3Audio'],
      ['videos', '2Vidéos'],
      ['documents', '1Documents'],
    ]);
    expect(text('[data-conversation-stats] h4')).toBe('Statistiques');
  });

  test('les participants, du plus actif au plus discret, avec leurs mots', async () => {
    mount({ replies: { [STATS]: served(wire()) } });
    await until(() => $$('[data-conversation-stats-participant]').length === 2);
    expect($$('[data-conversation-stats-participant]').map((row) => row.textContent)).toEqual([
      '#1Nour Haddad200 mots30',
      '#2Sam Kim110 mots12',
    ]);
  });

  test('les langues, par leur nom et leur part', async () => {
    mount({ replies: { [STATS]: served(wire()) } });
    await until(() => $$('[data-conversation-stats-language]').length === 2);
    expect($$('[data-conversation-stats-language]').map((row) => (row.textContent ?? '').replace(/[\u00a0\u202f]/g, ' '))).toEqual(['français75 %', 'anglais25 %']);
  });

  test('l’activité : 7 jours d’abord, une barre par jour, résumée au lecteur d’écran ; « 30j » en montre trente', async () => {
    mount({ replies: { [STATS]: served(wire()) } });
    await until(() => $('[data-conversation-stats-chart]') !== null);
    expect($$('[data-conversation-stats-bar]')).toHaveLength(7);
    expect($('[data-conversation-stats-chart]')?.getAttribute('role')).toBe('img');
    expect($('[data-conversation-stats-chart]')?.getAttribute('aria-label')).toBe('8 messages — 7 derniers jours');

    const periods = $$('[data-conversation-stats-period]');
    expect(periods.map((button) => [button.textContent, button.getAttribute('aria-pressed'), button.getAttribute('aria-label')])).toEqual([
      ['7j', 'true', '7 derniers jours'],
      ['30j', 'false', '30 derniers jours'],
      ['Tout', 'false', 'Depuis le début'],
    ]);
    expect(periods.every((button) => button.style.minHeight === '44px' && button.style.minWidth === '44px')).toBe(true);

    click(periods[1] ?? null);
    expect($$('[data-conversation-stats-bar]')).toHaveLength(30);
    expect($('[data-conversation-stats-period="month"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('les états dessinés', () => {
  test('cache VIDE et réponse en vol : un squelette, annoncé au lecteur d’écran', async () => {
    mount({ replies: { [STATS]: 'pending' } });
    await until(() => $('[data-conversation-stats-loading]') !== null);
    expect($('[data-conversation-stats-loading]')?.getAttribute('aria-busy')).toBe('true');
    expect(text('[data-conversation-stats-loading]')).toContain('Chargement des statistiques');
  });

  test('CACHE D’ABORD : des statistiques déjà vues se peignent tout de suite, sans squelette, pendant la revalidation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(conversationStatsQueryKey('c1'), decodeConversationStats(wire()), { updatedAt: 0 });
    mount({ replies: { [STATS]: 'pending' }, client });
    await until(() => $('[data-conversation-stats-counters]') !== null);
    expect($('[data-conversation-stats-loading]')).toBeNull();
    expect(text('[data-conversation-stat="messages"]')).toContain('42');
  });

  test('refus et cache vide : l’erreur se dit, « Réessayer » relance', async () => {
    const { calls } = mount({ replies: { [STATS]: { ok: false, status: 500, error: 'boom' } } });
    await until(() => $('[data-conversation-stats-error]') !== null);
    expect($('[data-conversation-stats-error]')?.getAttribute('role')).toBe('alert');
    expect(text('[data-conversation-stats-error]')).toContain('Impossible de charger les statistiques.');
    const before = calls().length;
    click($('[data-conversation-stats-error] button'));
    await settle();
    expect(calls().length).toBe(before + 1);
  });

  test('aucun message : une phrase, pas des zéros', async () => {
    mount({ replies: { [STATS]: served({ conversationId: 'c1', totalMessages: 0 }) } });
    await until(() => $('[data-conversation-stats-empty]') !== null);
    expect($('[data-conversation-stats-counters]')).toBeNull();
  });

  test('hors ligne sans cache : on le dit, sans squelette', async () => {
    offline();
    mount({ replies: { [STATS]: 'pending' } });
    await until(() => $('[data-conversation-stats-offline-empty]') !== null);
    expect($('[data-conversation-stats-loading]')).toBeNull();
  });

  test('hors ligne AVEC cache : les dernières statistiques restent, et on dit qu’elles datent', async () => {
    offline();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(conversationStatsQueryKey('c1'), decodeConversationStats(wire()));
    mount({ replies: { [STATS]: 'pending' }, client });
    await until(() => $('[data-conversation-stats-offline]') !== null);
    expect($('[data-conversation-stats-counters]')).not.toBeNull();
  });
});
