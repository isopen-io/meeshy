import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { DEFAULT_ENGAGEMENT_SCALE, type EngagementScale } from '@meeshy/shared/types/engagement-scale';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminEngagementScalePanel } from './admin-engagement-scale-parts';

/**
 * LE BARÈME PAR ONGLETS, LES SÉRIES PAR ACTE ET LA FIDÉLITÉ (#10395) — sans plafond à
 * 1000 : un an de fidélité vaut 100 000 points, chaque acte a ses paliers, un gros
 * palier est signalé sans être bloqué.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadInterfaceCatalog('fr')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const SERVED = { scale: DEFAULT_ENGAGEMENT_SCALE, updatedAt: null, updatedBy: null };

type Spy = { readonly transport: HttpTransport; readonly requests: HttpRequest[] };

function scaleTransport(options: { readonly putRefused?: string; readonly getBody?: unknown } = {}): Spy {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (request: HttpRequest): Promise<ApiResult<unknown>> => {
    requests.push(request);
    if (request.method === 'GET') return { ok: true, data: options.getBody ?? SERVED };
    if (request.method === 'PUT') {
      if (options.putRefused !== undefined) return { ok: false, status: 400, error: options.putRefused };
      const body = request.body as { readonly scale: EngagementScale };
      return { ok: true, data: { scale: body.scale, updatedAt: '2026-09-30T10:00:00.000Z', updatedBy: 'admin-1' } };
    }
    return { ok: false, status: 404, error: 'non prévu' };
  }) as HttpTransport['request'];
  return { transport, requests };
}

async function mountPanel(spy: Spy): Promise<HTMLDivElement> {
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminEngagementScalePanel language="fr" deps={{ source: 'gateway', transport: spy.transport }} />
    </QueryClientProvider>,
  );
}

const input = (host: ParentNode, selector: string): HTMLInputElement => {
  const element = host.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) throw new Error(`champ absent : ${selector}`);
  return element;
};

const puts = (spy: Spy) => spy.requests.filter((request) => request.method === 'PUT');

/** Enregistrer, c'est soumettre PUIS confirmer : un barème vaut pour tous les membres (audit 2026-10-04). */
async function enregistrer(host: HTMLElement): Promise<void> {
  await mounter.submit(host);
  await mounter.click(document.querySelector<HTMLElement>('[data-admin-confirm] [data-admin-action="confirm"]'));
}

describe('les onglets du barème', () => {
  test('cinq onglets ; seul le panneau actif est visible, les autres restent montés', async () => {
    const host = await mountPanel(scaleTransport());
    expect([...host.querySelectorAll('[data-admin-tab]')].map((tab) => tab.textContent)).toEqual(['Opérations', 'Séries', 'Fidélité', 'Élan', 'Garde-fous']);
    const panel = (id: string) => host.querySelector<HTMLElement>(`[data-scale-tab-panel="${id}"]`);
    expect(panel('operations')?.hidden).toBe(false);
    expect(panel('loyalty')?.hidden).toBe(true);
    await mounter.click(host.querySelector('[data-admin-tab="loyalty"]'));
    expect(panel('loyalty')?.hidden).toBe(false);
    expect(panel('operations')?.hidden).toBe(true);
  });

  test('l’onglet Séries porte la série globale et les neuf actes, chacun nommé', async () => {
    const host = await mountPanel(scaleTransport());
    const acts = [...host.querySelectorAll('[data-scale-tab-panel="streaks"] [data-scale-tiers]')].map((list) => list.getAttribute('data-scale-tiers'));
    expect(acts).toEqual(['global', 'conversation', 'post', 'reel', 'story', 'comment', 'mood', 'reaction_post', 'reaction_reel', 'reaction_story']);
  });
});

describe('les séries par acte et la fidélité partent dans le PUT, sans plafond à 1000', () => {
  test('« Un an → 100 000 points » pose le palier de fidélité, signalé au-delà de 10 000, et part tel quel', async () => {
    const spy = scaleTransport();
    const host = await mountPanel(spy);
    await mounter.click(host.querySelector('[data-scale-loyalty-preset]'));
    expect(host.querySelector('[data-scale-big-warning]')?.textContent).toContain('10 000');
    expect(host.querySelector('[data-scale-tiers="loyalty"] [data-scale-tier-formatted]')?.textContent?.replace(/\s/g, ' ')).toContain('100 000');
    await enregistrer(host);
    const body = puts(spy)[0]?.body as { readonly scale: EngagementScale } | undefined;
    expect(body?.scale.loyalty).toEqual([{ days: 365, points: 100000, label: 'Un an de fidélité' }]);
  });

  test('un palier ajouté à la série des réels part dans streaks.acts.reel', async () => {
    const spy = scaleTransport();
    const host = await mountPanel(spy);
    await mounter.click(host.querySelector('[data-scale-tier-add="reel"]'));
    mounter.type(host, '[data-scale-tier-days="reel:0"]', '30');
    mounter.type(host, '[data-scale-tier-points="reel:0"]', '5000');
    await enregistrer(host);
    const body = puts(spy)[0]?.body as { readonly scale: EngagementScale } | undefined;
    expect(body?.scale.streaks?.acts.reel).toEqual([{ days: 30, points: 5000 }]);
    expect(body?.scale.streaks?.acts.post).toEqual([]);
  });

  test('un barème servi avec des séries par acte et une fidélité se relit dans le brouillon', async () => {
    const scale = { ...DEFAULT_ENGAGEMENT_SCALE, streaks: { global: [{ days: 7, points: 20 }], acts: { ...Object.fromEntries(['conversation', 'post', 'reel', 'story', 'comment', 'mood', 'reaction_post', 'reaction_reel', 'reaction_story'].map((act) => [act, []])), story: [{ days: 14, points: 300, label: 'Deux semaines' }] } }, loyalty: [{ days: 365, points: 100000 }] };
    const host = await mountPanel(scaleTransport({ getBody: { scale, updatedAt: null, updatedBy: null } }));
    expect(input(host, '[data-scale-tier-points="story:0"]').value).toBe('300');
    expect(input(host, '[data-scale-tier-label="story:0"]').value).toBe('Deux semaines');
    expect(input(host, '[data-scale-tier-points="loyalty:0"]').value).toBe('100000');
    expect(input(host, '[data-scale-streak-days="0"]').value).toBe('7');
  });
});
