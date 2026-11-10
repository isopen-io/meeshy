import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { bringAvailabilityQueryKey, type BringAvailabilityView } from '@/lib/bring/bring-api';
import { createBringStore } from '@/lib/bring/bring-live';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileBringRow, ProfileBringRowView } from './user-profile-bring';

/**
 * LE BRING SUR LA FICHE D'UNE PERSONNE (#13936, `proche-bring@web`) — le bouton
 * n'existe que si le serveur le dit (`available`), il s'explique (« urgence
 * extrême », et ce qui l’en empêche, #17442), compte ce qui reste aujourd'hui, se confirme,
 * puis dit « Ça sonne chez X » avec « Annuler » tant que ça sonne.
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

const ADA = { id: 'u-ada', username: 'ada', displayName: 'Ada', avatar: null };
const noop = () => undefined;

const availability = (overrides: Partial<BringAvailabilityView> = {}): BringAvailabilityView => ({
  available: true,
  perDay: 3,
  remainingToday: 2,
  resetsAt: '2026-11-08T00:00:00.000Z',
  ...overrides,
});

const view = (props: { readonly availability: BringAvailabilityView | null; readonly ringing?: boolean }) =>
  renderToStaticMarkup(
    <ProfileBringRowView language="fr" name="Ada" availability={props.availability} ringing={props.ringing ?? false} busy={false} onBring={noop} onCancel={noop} />,
  );

describe('la ligne du Bring', () => {
  test('ABSENTE tant que le serveur ne l’ouvre pas — jamais grisée, jamais devinée', () => {
    expect(view({ availability: null })).toBe('');
    expect(view({ availability: availability({ available: false }) })).toBe('');
  });

  test('le bouton s’explique et compte ce qui reste aujourd’hui', () => {
    const html = view({ availability: availability() });
    expect(html).toContain('data-bring-send');
    expect(html).toContain('même verrouillé');
    expect(html).not.toContain('même en silencieux');
    expect(html).toContain('un iPhone en silencieux avec Meeshy fermé ne montre qu’une alerte prioritaire');
    expect(html).toContain('Restants aujourd’hui : 2');
  });

  test('illimité (Atome) : « Sans limite aujourd’hui », jamais « null »', () => {
    expect(view({ availability: availability({ perDay: null, remainingToday: null }) })).toContain('Sans limite aujourd’hui');
  });

  test('quota épuisé : le bouton laisse place à « Plus de Bring aujourd’hui vers Ada »', () => {
    const html = view({ availability: availability({ remainingToday: 0 }) });
    expect(html).not.toContain('data-bring-send');
    expect(html).toContain('Plus de Bring aujourd’hui vers Ada');
  });

  test('tant que ça sonne : « Ça sonne chez Ada » et « Annuler le Bring »', () => {
    const html = view({ availability: availability(), ringing: true });
    expect(html).toContain('Ça sonne chez Ada');
    expect(html).toContain('data-bring-cancel');
    expect(html).not.toContain('data-bring-send');
  });
});

function scripted(responses: Readonly<Record<string, ApiResult<unknown>>>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return responses[`${req.method} ${req.path}`] ?? { ok: false, status: 500, error: 'x' };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

const sent = { bringId: 'b9', toUserId: 'u-ada', sentAt: '2026-11-07T10:00:00.000Z', expiresAt: new Date(Date.now() + 120_000).toISOString(), perDay: 3, remainingToday: 1 };

describe('proposer le Bring hors amitié (#16623)', () => {
  const gate = (accessLevel: string) => ({ ok: true as const, data: { userId: 'u-ada', effectiveLevel: 'PUBLIC', accessLevel } });
  const open = { ok: true as const, data: { userId: 'u-ada', available: true, perDay: 3, remainingToday: 3, resetsAt: '2026-11-08T00:00:00.000Z' } };

  test('un collègue de l’équipe sans lien : la passerelle sert `accessLevel` Sang, la ligne demande le Bring et le propose', async () => {
    const { deps, requests } = scripted({ 'GET /api/v1/relations/u-ada': gate('BLOOD'), 'GET /api/v1/bring/u-ada': open });
    const node = await mount(<ProfileBringRow language="fr" person={ADA} friend={false} store={createBringStore()} deps={deps} onNotice={noop} />);
    await settle();
    await settle();
    expect(requests.map((req) => `${req.method} ${req.path}`)).toContain('GET /api/v1/bring/u-ada');
    expect(node.querySelector('[data-bring-send]')).not.toBeNull();
  });

  test('un inconnu : aucune demande de Bring, aucune ligne', async () => {
    const { deps, requests } = scripted({ 'GET /api/v1/relations/u-ada': gate('PUBLIC'), 'GET /api/v1/bring/u-ada': open });
    const node = await mount(<ProfileBringRow language="fr" person={ADA} friend={false} store={createBringStore()} deps={deps} onNotice={noop} />);
    await settle();
    await settle();
    expect(requests.map((req) => `${req.method} ${req.path}`)).not.toContain('GET /api/v1/bring/u-ada');
    expect(node.querySelector('[data-bring-row]')).toBeNull();
  });

  test('un ami : le Bring se demande sans attendre la porte du lien', async () => {
    const { deps, requests } = scripted({ 'GET /api/v1/bring/u-ada': open });
    await mount(<ProfileBringRow language="fr" person={ADA} friend store={createBringStore()} deps={deps} onNotice={noop} />);
    await settle();
    expect(requests.map((req) => `${req.method} ${req.path}`)).toEqual(['GET /api/v1/bring/u-ada']);
  });
});

describe('envoyer un Bring', () => {
  test('confirmer fait sonner, suit le Bring et met le compteur à jour sans relire', async () => {
    appQueryClient.setQueryData(bringAvailabilityQueryKey('u-ada'), availability());
    const store = createBringStore();
    const { deps, requests } = scripted({ 'POST /api/v1/bring/u-ada': { ok: true, data: sent } });
    const node = await mount(<ProfileBringRow language="fr" person={ADA} friend store={store} deps={deps} onNotice={noop} />);
    await click(node.querySelector<HTMLButtonElement>('[data-bring-send]'));
    expect(requests.filter((req) => req.method === 'POST')).toHaveLength(0);
    await click(document.querySelector<HTMLButtonElement>('[data-confirm-dialog="bring-send"] [data-confirm="confirm"]'));
    expect(requests.filter((req) => req.method === 'POST')).toHaveLength(1);
    expect(store.getState().outgoing['u-ada']?.bringId).toBe('b9');
    expect(node.textContent).toContain('Ça sonne chez Ada');
    expect(appQueryClient.getQueryData<BringAvailabilityView>(bringAvailabilityQueryKey('u-ada'))?.remainingToday).toBe(1);
  });

  test('un refus « bloqué » fait DISPARAÎTRE le bouton, sans rien dire du blocage', async () => {
    appQueryClient.setQueryData(bringAvailabilityQueryKey('u-ada'), availability());
    const notices: string[] = [];
    const { deps } = scripted({ 'POST /api/v1/bring/u-ada': { ok: false, status: 403, error: 'x', code: 'BRING_BLOCKED' } });
    const node = await mount(<ProfileBringRow language="fr" person={ADA} friend store={createBringStore()} deps={deps} onNotice={(text) => notices.push(text)} />);
    await click(node.querySelector<HTMLButtonElement>('[data-bring-send]'));
    await click(document.querySelector<HTMLButtonElement>('[data-confirm-dialog="bring-send"] [data-confirm="confirm"]'));
    expect(node.querySelector('[data-bring-row]')).toBeNull();
    expect(notices).toEqual([]);
  });

  test('quota atteint entre-temps : « Plus de Bring aujourd’hui vers Ada »', async () => {
    appQueryClient.setQueryData(bringAvailabilityQueryKey('u-ada'), availability());
    const notices: string[] = [];
    const { deps } = scripted({ 'POST /api/v1/bring/u-ada': { ok: false, status: 429, error: 'x', code: 'BRING_QUOTA_EXCEEDED' } });
    const node = await mount(<ProfileBringRow language="fr" person={ADA} friend store={createBringStore()} deps={deps} onNotice={(text) => notices.push(text)} />);
    await click(node.querySelector<HTMLButtonElement>('[data-bring-send]'));
    await click(document.querySelector<HTMLButtonElement>('[data-confirm-dialog="bring-send"] [data-confirm="confirm"]'));
    expect(node.textContent).toContain('Plus de Bring aujourd’hui vers Ada');
    expect(notices).toEqual(['Plus de Bring aujourd’hui vers Ada']);
  });

  test('« Annuler le Bring » l’arrête au geste et chez le destinataire', async () => {
    appQueryClient.setQueryData(bringAvailabilityQueryKey('u-ada'), availability());
    const store = createBringStore();
    store.getState().sent(sent);
    const { deps, requests } = scripted({ 'DELETE /api/v1/bring/b9': { ok: true, data: { bringId: 'b9', stopped: true } } });
    const node = await mount(<ProfileBringRow language="fr" person={ADA} friend store={store} deps={deps} onNotice={noop} />);
    await click(node.querySelector<HTMLButtonElement>('[data-bring-cancel]'));
    expect(store.getState().outgoing).toEqual({});
    expect(requests.map((req) => `${req.method} ${req.path}`)).toContain('DELETE /api/v1/bring/b9');
    expect(node.querySelector('[data-bring-send]')).not.toBeNull();
  });
});
