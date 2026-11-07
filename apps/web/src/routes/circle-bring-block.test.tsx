import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { bringAvailabilityQueryKey, bringBlockedQueryKey } from '@/lib/bring/bring-api';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CircleBringBlockSwitch } from './circle-bring-block';

/**
 * « BLOQUER SES BRING », PAR PERSONNE (#13936, `proche-bring@web`) — iso
 * `CirclePersonSetting.blockBring` (iOS) : ouvert dès Ami, disponible par défaut
 * (le réglage est un BLOCAGE), optimiste avec retour arrière, et l'autre n'en
 * est jamais prévenu.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  appQueryClient.clear();
});

function scripted(put: () => Promise<ApiResult<unknown>>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return req.method === 'PUT' ? put() : { ok: true, data: { userId: 'u-ada', bringBlocked: false } };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

const toggle = (node: HTMLElement) => node.querySelector<HTMLInputElement>('[data-circle-setting="circles.settings.blockBring"]');

describe('Bloquer ses Bring', () => {
  test('ABSENT sous Ami : une Connaissance ne peut pas faire sonner, il n’y a rien à bloquer', async () => {
    const { deps } = scripted(async () => ({ ok: true, data: {} }));
    const node = await mount(<CircleBringBlockSwitch language="fr" userId="u-ada" level="ACQUAINTANCE" deps={deps} onNotice={() => undefined} />);
    expect(toggle(node)).toBeNull();
  });

  test('disponible par défaut : l’interrupteur part DÉCOCHÉ, actif, et se décrit', async () => {
    const { deps } = scripted(async () => ({ ok: true, data: {} }));
    const node = await mount(<CircleBringBlockSwitch language="fr" userId="u-ada" level="FRIEND" deps={deps} onNotice={() => undefined} />);
    expect(toggle(node)?.checked).toBe(false);
    expect(toggle(node)?.disabled).toBe(false);
    expect(node.textContent).toContain('Elle n’en est pas prévenue');
  });

  test('bloquer est OPTIMISTE et écrit `{ bringBlocked: true }`', async () => {
    const { deps, requests } = scripted(async () => ({ ok: true, data: { userId: 'u-ada', bringBlocked: true } }));
    const node = await mount(<CircleBringBlockSwitch language="fr" userId="u-ada" level="CLOSE" deps={deps} onNotice={() => undefined} />);
    await click(toggle(node));
    expect(toggle(node)?.checked).toBe(true);
    expect(requests.find((req) => req.method === 'PUT')).toMatchObject({ path: '/api/v1/relations/u-ada/settings', body: { bringBlocked: true } });
    expect(appQueryClient.getQueryData(bringBlockedQueryKey('u-ada'))).toBe(true);
  });

  test('un refus REND l’état d’avant et le dit', async () => {
    const notices: string[] = [];
    const { deps } = scripted(async () => ({ ok: false, status: 500, error: 'x' }));
    const node = await mount(<CircleBringBlockSwitch language="fr" userId="u-ada" level="FRIEND" deps={deps} onNotice={(text) => notices.push(text)} />);
    await click(toggle(node));
    expect(toggle(node)?.checked).toBe(false);
    expect(notices).toEqual(['Le réglage n’a pas pu être enregistré']);
  });

  test('bloquer ou débloquer relit MA disponibilité de Bring vers cette personne', async () => {
    appQueryClient.setQueryData(bringAvailabilityQueryKey('u-ada'), { available: true, perDay: 1, remainingToday: 1, resetsAt: null });
    const { deps } = scripted(async () => ({ ok: true, data: { userId: 'u-ada', bringBlocked: true } }));
    const node = await mount(<CircleBringBlockSwitch language="fr" userId="u-ada" level="FRIEND" deps={deps} onNotice={() => undefined} />);
    await click(toggle(node));
    expect(appQueryClient.getQueryState(bringAvailabilityQueryKey('u-ada'))?.isInvalidated).toBe(true);
  });
});
