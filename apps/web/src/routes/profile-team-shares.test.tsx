import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { personSettingsQueryKey } from '@/lib/relations/person-settings';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { isTeamPair, ProfileTeamShares } from './profile-team-shares';

/**
 * LA FICHE D'UN COLLÈGUE DE L'ÉQUIPE (#16864) — entre deux comptes MODERATOR,
 * ADMIN ou BIGBOSS, le titre écouté et les trois partages de position
 * s'accordent et se retirent d'un geste, sans lien. Refusés par défaut ; la fiche
 * d'un utilisateur ordinaire n'en montre aucun.
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

const PERSON = { id: 'u-ada', username: 'ada', displayName: 'Ada' };

type Script = { readonly viewerRole?: string; readonly shares?: Record<string, boolean>; readonly put?: () => Promise<ApiResult<unknown>> };

function scripted({ viewerRole = 'ADMIN', shares = {}, put = async () => ({ ok: true, data: {} }) }: Script = {}) {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    if (req.method === 'PUT') return put();
    if (req.path === '/api/v1/me/permissions') return { ok: true, data: { role: viewerRole, permissions: {} } };
    return { ok: true, data: { userId: 'u-ada', ...shares } };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

const switchOf = (node: HTMLElement, share: string) => node.querySelector<HTMLInputElement>(`[data-team-share="${share}"]`);
const allSwitches = (node: HTMLElement) => node.querySelectorAll('[data-team-share]');

describe('qui voit ces interrupteurs', () => {
  test('deux comptes de l’équipe, et eux seuls', () => {
    expect(isTeamPair('MODERATOR', 'ADMIN')).toBe(true);
    expect(isTeamPair('BIGBOSS', 'moderator')).toBe(true);
    expect(isTeamPair('USER', 'ADMIN')).toBe(false);
    expect(isTeamPair('ADMIN', 'USER')).toBe(false);
    expect(isTeamPair('AUDIT', 'ADMIN')).toBe(false);
    expect(isTeamPair('ADMIN', undefined)).toBe(false);
    expect(isTeamPair(null, 'ADMIN')).toBe(false);
  });

  test('la fiche d’un utilisateur ordinaire n’en montre AUCUN', async () => {
    const { deps } = scripted();
    const node = await mount(<ProfileTeamShares language="fr" person={PERSON} targetRole="USER" deps={deps} onNotice={() => undefined} />);
    await settle();
    expect(allSwitches(node)).toHaveLength(0);
    expect(node.textContent).toBe('');
  });

  test('un lecteur ordinaire n’en voit aucun, même face à un collègue', async () => {
    const { deps } = scripted({ viewerRole: 'USER' });
    const node = await mount(<ProfileTeamShares language="fr" person={PERSON} targetRole="ADMIN" deps={deps} onNotice={() => undefined} />);
    await settle();
    expect(allSwitches(node)).toHaveLength(0);
  });

  test('le rôle du lecteur pas encore connu : rien (fail-closed), jamais un clignotement', async () => {
    const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
    transport.request = (() => new Promise(() => undefined)) as HttpTransport['request'];
    const node = await mount(<ProfileTeamShares language="fr" person={PERSON} targetRole="ADMIN" deps={{ source: 'gateway', transport }} onNotice={() => undefined} />);
    expect(allSwitches(node)).toHaveLength(0);
  });
});

describe('le titre écouté et les trois partages de position', () => {
  test('quatre interrupteurs, refusés par défaut, nommés pour un lecteur d’écran', async () => {
    const { deps } = scripted();
    const node = await mount(<ProfileTeamShares language="fr" person={PERSON} targetRole="MODERATOR" deps={deps} onNotice={() => undefined} />);
    await settle();
    expect([...allSwitches(node)].map((input) => input.getAttribute('data-team-share'))).toEqual(['listeningTitleShared', 'locationShared', 'locationHistoryShared', 'proximityShared']);
    expect([...allSwitches(node)].every((input) => (input as HTMLInputElement).checked === false)).toBe(true);
    expect(node.querySelector('[role="group"]')?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(node.textContent).toContain('Le titre de ce que j’écoute');
    expect(node.textContent).toContain('Ma position en direct');
    expect(node.textContent).toContain('Ada');
  });

  test('un partage déjà accordé se lit COCHÉ', async () => {
    const { deps } = scripted({ shares: { locationShared: true } });
    const node = await mount(<ProfileTeamShares language="fr" person={PERSON} targetRole="ADMIN" deps={deps} onNotice={() => undefined} />);
    await settle();
    expect(switchOf(node, 'locationShared')?.checked).toBe(true);
    expect(switchOf(node, 'proximityShared')?.checked).toBe(false);
  });

  test('accorder est OPTIMISTE et n’écrit que `{ locationShared: true }`', async () => {
    const { deps, requests } = scripted({ put: async () => ({ ok: true, data: { userId: 'u-ada', locationShared: true } }) });
    const node = await mount(<ProfileTeamShares language="fr" person={PERSON} targetRole="ADMIN" deps={deps} onNotice={() => undefined} />);
    await settle();
    await click(switchOf(node, 'locationShared'));
    expect(switchOf(node, 'locationShared')?.checked).toBe(true);
    expect(requests.find((req) => req.method === 'PUT')).toMatchObject({ path: '/api/v1/relations/u-ada/settings', body: { locationShared: true } });
    expect(appQueryClient.getQueryData(personSettingsQueryKey('u-ada'))).toMatchObject({ locationShared: true });
  });

  test('retirer écrit `false` d’un geste', async () => {
    const { deps, requests } = scripted({ shares: { listeningTitleShared: true }, put: async () => ({ ok: true, data: { userId: 'u-ada' } }) });
    const node = await mount(<ProfileTeamShares language="fr" person={PERSON} targetRole="ADMIN" deps={deps} onNotice={() => undefined} />);
    await settle();
    await click(switchOf(node, 'listeningTitleShared'));
    expect(switchOf(node, 'listeningTitleShared')?.checked).toBe(false);
    expect(requests.find((req) => req.method === 'PUT')).toMatchObject({ body: { listeningTitleShared: false } });
  });

  test('un refus REND l’état d’avant et le dit', async () => {
    const notices: string[] = [];
    const { deps } = scripted({ put: async () => ({ ok: false, status: 400, error: 'x' }) });
    const node = await mount(<ProfileTeamShares language="fr" person={PERSON} targetRole="ADMIN" deps={deps} onNotice={(text) => notices.push(text)} />);
    await settle();
    await click(switchOf(node, 'proximityShared'));
    expect(switchOf(node, 'proximityShared')?.checked).toBe(false);
    expect(notices).toEqual(['Le partage n’a pas pu être enregistré']);
  });

  test('hors ligne, le cache déjà là s’affiche sans attendre le réseau', async () => {
    appQueryClient.setQueryData(personSettingsQueryKey('u-ada'), { bringBlocked: false, talkieBlocked: false, listeningCategoryShared: false, listeningTitleShared: false, locationShared: true, locationHistoryShared: false, proximityShared: false });
    const { deps } = scripted();
    const node = await mount(<ProfileTeamShares language="fr" person={PERSON} targetRole="ADMIN" deps={deps} onNotice={() => undefined} />);
    await settle();
    expect(switchOf(node, 'locationShared')?.checked).toBe(true);
  });
});
