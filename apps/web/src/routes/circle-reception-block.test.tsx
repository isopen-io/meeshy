import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { bringAvailabilityQueryKey } from '@/lib/bring/bring-api';
import { personSettingsQueryKey } from '@/lib/relations/person-settings';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CircleReceptionBlockSwitch, receptionBlocksFor } from './circle-reception-block';

/**
 * « BLOQUER SES BRING », PAR PERSONNE (#13936, `proche-bring@web`) — iso
 * `CirclePersonSetting.blockBring` (iOS) : ouvert dès Ami, disponible par défaut
 * (le réglage est un BLOCAGE), optimiste avec retour arrière, et l'autre n'en
 * est jamais prévenu.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

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
    return req.method === 'PUT' ? put() : { ok: true, data: { userId: 'u-ada', bringBlocked: false, talkieBlocked: false } };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

const toggle = (node: HTMLElement) => node.querySelector<HTMLInputElement>('[data-circle-setting="circles.settings.blockBring"]');
const talkieToggle = (node: HTMLElement) => node.querySelector<HTMLInputElement>('[data-circle-setting="circles.settings.blockTalkie"]');

describe('Bloquer ses Bring', () => {
  test('ABSENT sous Ami : une Connaissance ne peut pas faire sonner, il n’y a rien à bloquer', async () => {
    const { deps } = scripted(async () => ({ ok: true, data: {} }));
    const node = await mount(<CircleReceptionBlockSwitch block="bringBlocked" language="fr" userId="u-ada" level="ACQUAINTANCE" deps={deps} onNotice={() => undefined} />);
    expect(toggle(node)).toBeNull();
  });

  test('disponible par défaut : l’interrupteur part DÉCOCHÉ, actif, et se décrit', async () => {
    const { deps } = scripted(async () => ({ ok: true, data: {} }));
    const node = await mount(<CircleReceptionBlockSwitch block="bringBlocked" language="fr" userId="u-ada" level="FRIEND" deps={deps} onNotice={() => undefined} />);
    expect(toggle(node)?.checked).toBe(false);
    expect(toggle(node)?.disabled).toBe(false);
    expect(node.textContent).toContain('Elle n’en est pas prévenue');
  });

  test('bloquer est OPTIMISTE et écrit `{ bringBlocked: true }`', async () => {
    const { deps, requests } = scripted(async () => ({ ok: true, data: { userId: 'u-ada', bringBlocked: true } }));
    const node = await mount(<CircleReceptionBlockSwitch block="bringBlocked" language="fr" userId="u-ada" level="CLOSE" deps={deps} onNotice={() => undefined} />);
    await click(toggle(node));
    expect(toggle(node)?.checked).toBe(true);
    expect(requests.find((req) => req.method === 'PUT')).toMatchObject({ path: '/api/v1/relations/u-ada/settings', body: { bringBlocked: true } });
    expect(appQueryClient.getQueryData(personSettingsQueryKey('u-ada'))).toMatchObject({ bringBlocked: true });
  });

  test('un refus REND l’état d’avant et le dit', async () => {
    const notices: string[] = [];
    const { deps } = scripted(async () => ({ ok: false, status: 500, error: 'x' }));
    const node = await mount(<CircleReceptionBlockSwitch block="bringBlocked" language="fr" userId="u-ada" level="FRIEND" deps={deps} onNotice={(text) => notices.push(text)} />);
    await click(toggle(node));
    expect(toggle(node)?.checked).toBe(false);
    expect(notices).toEqual(['Le réglage n’a pas pu être enregistré']);
  });

  test('bloquer ou débloquer relit MA disponibilité de Bring vers cette personne', async () => {
    appQueryClient.setQueryData(bringAvailabilityQueryKey('u-ada'), { available: true, perDay: 1, remainingToday: 1, resetsAt: null });
    const { deps } = scripted(async () => ({ ok: true, data: { userId: 'u-ada', bringBlocked: true } }));
    const node = await mount(<CircleReceptionBlockSwitch block="bringBlocked" language="fr" userId="u-ada" level="FRIEND" deps={deps} onNotice={() => undefined} />);
    await click(toggle(node));
    expect(appQueryClient.getQueryState(bringAvailabilityQueryKey('u-ada'))?.isInvalidated).toBe(true);
  });
});

describe('Couper son talkie (#16638)', () => {
  test('ABSENT sous Proche : un Ami ne peut pas parler sans décrocher, il n’y a rien à couper', async () => {
    const { deps } = scripted(async () => ({ ok: true, data: {} }));
    const node = await mount(<CircleReceptionBlockSwitch block="talkieBlocked" language="fr" userId="u-ada" level="FRIEND" deps={deps} onNotice={() => undefined} />);
    expect(talkieToggle(node)).toBeNull();
  });

  test('ouvert dès Proche, DÉCOCHÉ par défaut, et il dit où va la voix', async () => {
    const { deps } = scripted(async () => ({ ok: true, data: {} }));
    const node = await mount(<CircleReceptionBlockSwitch block="talkieBlocked" language="fr" userId="u-ada" level="CLOSE" deps={deps} onNotice={() => undefined} />);
    expect(talkieToggle(node)?.checked).toBe(false);
    expect(node.textContent).toContain('elle arrivera en message vocal');
  });

  test('couper est OPTIMISTE, écrit `{ talkieBlocked: true }` SEUL, et ne touche pas au Bring', async () => {
    const { deps, requests } = scripted(async () => ({ ok: true, data: { userId: 'u-ada', bringBlocked: false, talkieBlocked: true } }));
    const node = await mount(
      <>
        <CircleReceptionBlockSwitch block="bringBlocked" language="fr" userId="u-ada" level="BLOOD" deps={deps} onNotice={() => undefined} />
        <CircleReceptionBlockSwitch block="talkieBlocked" language="fr" userId="u-ada" level="BLOOD" deps={deps} onNotice={() => undefined} />
      </>,
    );
    await click(talkieToggle(node));
    expect(talkieToggle(node)?.checked).toBe(true);
    expect(toggle(node)?.checked).toBe(false);
    expect(requests.filter((req) => req.method === 'PUT').map((req) => req.body)).toEqual([{ talkieBlocked: true }]);
    expect(requests.filter((req) => req.method === 'GET')).toHaveLength(1);
  });

  test('un refus REND l’état d’avant et le dit', async () => {
    const notices: string[] = [];
    const { deps } = scripted(async () => ({ ok: false, status: 500, error: 'x' }));
    const node = await mount(<CircleReceptionBlockSwitch block="talkieBlocked" language="fr" userId="u-ada" level="CLOSE" deps={deps} onNotice={(text) => notices.push(text)} />);
    await click(talkieToggle(node));
    expect(talkieToggle(node)?.checked).toBe(false);
    expect(notices).toEqual(['Le réglage n’a pas pu être enregistré']);
  });

  test('les coupures offertes suivent le cercle', () => {
    expect(receptionBlocksFor('ACQUAINTANCE')).toEqual([]);
    expect(receptionBlocksFor('FRIEND')).toEqual(['bringBlocked']);
    expect(receptionBlocksFor('CLOSE')).toEqual(['bringBlocked', 'talkieBlocked', 'listeningCategoryShared']);
    expect(receptionBlocksFor('BLOOD')).toEqual(['bringBlocked', 'talkieBlocked', 'listeningCategoryShared']);
  });
});

describe('Accorder « Ce que j’écoute » (#16831)', () => {
  const listening = (node: HTMLElement) => node.querySelector<HTMLInputElement>('[data-circle-setting="circles.settings.listening"]');

  test('ABSENT sous Proche : un Ami ne voit jamais ce que j’écoute, il n’y a rien à accorder', async () => {
    const { deps } = scripted(async () => ({ ok: true, data: {} }));
    const node = await mount(<CircleReceptionBlockSwitch block="listeningCategoryShared" language="fr" userId="u-ada" level="FRIEND" deps={deps} onNotice={() => undefined} />);
    expect(listening(node)).toBeNull();
  });

  test('ouvert dès Proche, REFUSÉ par défaut, et il dit ce qui part et ce qui ne part jamais', async () => {
    const { deps } = scripted(async () => ({ ok: true, data: {} }));
    const node = await mount(<CircleReceptionBlockSwitch block="listeningCategoryShared" language="fr" userId="u-ada" level="CLOSE" deps={deps} onNotice={() => undefined} />);
    expect(listening(node)?.checked).toBe(false);
    expect(listening(node)?.disabled).toBe(false);
    expect(node.textContent).toContain('Ce que j’écoute');
    expect(node.textContent).toContain('Apple Music');
    expect(node.textContent).toContain('Vos messages vocaux ne sont jamais partagés');
  });

  test('un serveur qui ne connaît pas le champ se lit « non accordé »', async () => {
    const { deps } = scripted(async () => ({ ok: true, data: { userId: 'u-ada', bringBlocked: false, talkieBlocked: false } }));
    const node = await mount(<CircleReceptionBlockSwitch block="listeningCategoryShared" language="fr" userId="u-ada" level="BLOOD" deps={deps} onNotice={() => undefined} />);
    expect(listening(node)?.checked).toBe(false);
  });

  test('un accord déjà posé se lit coché', async () => {
    const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
    transport.request = (async () => ({ ok: true, data: { userId: 'u-ada', bringBlocked: false, talkieBlocked: false, listeningCategoryShared: true } })) as HttpTransport['request'];
    const node = await mount(<CircleReceptionBlockSwitch block="listeningCategoryShared" language="fr" userId="u-ada" level="CLOSE" deps={{ source: 'gateway', transport }} onNotice={() => undefined} />);
    await settle();
    expect(listening(node)?.checked).toBe(true);
  });

  test('accorder est OPTIMISTE, écrit `{ listeningCategoryShared: true }` SEUL, et ne touche ni au Bring ni au talkie', async () => {
    const { deps, requests } = scripted(async () => ({ ok: true, data: { userId: 'u-ada', bringBlocked: false, talkieBlocked: false, listeningCategoryShared: true } }));
    const node = await mount(
      <>
        <CircleReceptionBlockSwitch block="bringBlocked" language="fr" userId="u-ada" level="CLOSE" deps={deps} onNotice={() => undefined} />
        <CircleReceptionBlockSwitch block="talkieBlocked" language="fr" userId="u-ada" level="CLOSE" deps={deps} onNotice={() => undefined} />
        <CircleReceptionBlockSwitch block="listeningCategoryShared" language="fr" userId="u-ada" level="CLOSE" deps={deps} onNotice={() => undefined} />
      </>,
    );
    await click(listening(node));
    expect(listening(node)?.checked).toBe(true);
    expect(toggle(node)?.checked).toBe(false);
    expect(talkieToggle(node)?.checked).toBe(false);
    expect(requests.filter((req) => req.method === 'PUT').map((req) => req.body)).toEqual([{ listeningCategoryShared: true }]);
    expect(appQueryClient.getQueryData(personSettingsQueryKey('u-ada'))).toMatchObject({ listeningCategoryShared: true });
  });

  test('retirer l’accord écrit `{ listeningCategoryShared: false }`', async () => {
    appQueryClient.setQueryData(personSettingsQueryKey('u-ada'), { bringBlocked: false, talkieBlocked: false, listeningCategoryShared: true });
    const { deps, requests } = scripted(async () => ({ ok: true, data: { userId: 'u-ada', listeningCategoryShared: false } }));
    const node = await mount(<CircleReceptionBlockSwitch block="listeningCategoryShared" language="fr" userId="u-ada" level="CLOSE" deps={deps} onNotice={() => undefined} />);
    await click(listening(node));
    expect(listening(node)?.checked).toBe(false);
    expect(requests.filter((req) => req.method === 'PUT').map((req) => req.body)).toEqual([{ listeningCategoryShared: false }]);
  });

  test('un refus REND l’état d’avant (refusé) et le dit', async () => {
    const notices: string[] = [];
    const { deps } = scripted(async () => ({ ok: false, status: 500, error: 'x' }));
    const node = await mount(<CircleReceptionBlockSwitch block="listeningCategoryShared" language="fr" userId="u-ada" level="CLOSE" deps={deps} onNotice={(text) => notices.push(text)} />);
    await click(listening(node));
    expect(listening(node)?.checked).toBe(false);
    expect(notices).toEqual(['Le partage n’a pas pu être enregistré']);
  });
});
