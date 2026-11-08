import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';

import { loadReceptionSettings, personSettingsQueryKey, setPersonSetting, setReceptionBlocked, TEAM_SHARES } from './person-settings';

/**
 * LES PRÉFÉRENCES DE RÉCEPTION PAR PERSONNE (#13936, #16638) — une lecture pour
 * la fiche entière, une écriture STRICTE d'un seul champ.
 */

const OTHER = '64b000000000000000000002';

function fakeTransport(result: ApiResult<unknown>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => result) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return result;
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

describe('les préférences de réception', () => {
  test('une seule lecture rend le Bring ET le talkie', async () => {
    const { deps, requests } = fakeTransport({ ok: true, data: { userId: OTHER, bringBlocked: true, talkieBlocked: false, locationShared: true } });
    expect(await loadReceptionSettings(deps, OTHER)).toMatchObject({ ok: true, data: { bringBlocked: true, talkieBlocked: false, listeningCategoryShared: false } });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'GET', path: `/api/v1/relations/${OTHER}/settings` });
  });

  test('un réglage absent ou illisible se lit « non coupé » : la valeur par défaut du serveur', async () => {
    const { deps } = fakeTransport({ ok: true, data: { talkieBlocked: 'oui', listeningCategoryShared: 'oui' } });
    expect(await loadReceptionSettings(deps, OTHER)).toMatchObject({ ok: true, data: { bringBlocked: false, talkieBlocked: false, listeningCategoryShared: false } });
  });

  test('la catégorie de mon écoute se lit ACCORDÉE seulement sur un `true` explicite (#16831)', async () => {
    const { deps } = fakeTransport({ ok: true, data: { userId: OTHER, bringBlocked: false, talkieBlocked: false, listeningCategoryShared: true } });
    expect(await loadReceptionSettings(deps, OTHER)).toMatchObject({ ok: true, data: { bringBlocked: false, talkieBlocked: false, listeningCategoryShared: true } });
  });

  test('accorder la catégorie de mon écoute n’écrit QUE ce champ', async () => {
    const { deps, requests } = fakeTransport({ ok: true, data: { userId: OTHER, listeningCategoryShared: true } });
    await setReceptionBlocked(deps, OTHER, 'listeningCategoryShared', true);
    expect(requests[0]!.body).toEqual({ listeningCategoryShared: true });
  });

  test('l’écriture ne porte QUE le champ réglé (corps strict)', async () => {
    const { deps, requests } = fakeTransport({ ok: true, data: { userId: OTHER, bringBlocked: false, talkieBlocked: true } });
    expect(await setReceptionBlocked(deps, OTHER, 'talkieBlocked', true)).toMatchObject({ ok: true, data: { bringBlocked: false, talkieBlocked: true, listeningCategoryShared: false } });
    expect(requests[0]).toMatchObject({ method: 'PUT', path: `/api/v1/relations/${OTHER}/settings`, body: { talkieBlocked: true } });
    expect(Object.keys(requests[0]!.body as object)).toEqual(['talkieBlocked']);
  });

  test('un refus remonte tel quel', async () => {
    const { deps } = fakeTransport({ ok: false, status: 403, error: 'non' });
    expect(await setReceptionBlocked(deps, OTHER, 'bringBlocked', true)).toEqual({ ok: false, status: 403, error: 'non' });
  });

  test('la clé de cache est par personne', () => {
    expect(personSettingsQueryKey(OTHER)).not.toEqual(personSettingsQueryKey('x'));
  });

  test('les quatre partages du rituel se lisent « non accordés » sans `true` explicite (#16864)', async () => {
    const { deps } = fakeTransport({ ok: true, data: { userId: OTHER, locationShared: true, proximityShared: 'oui' } });
    const result = await loadReceptionSettings(deps, OTHER);
    expect(result).toMatchObject({ ok: true, data: { listeningTitleShared: false, locationShared: true, locationHistoryShared: false, proximityShared: false } });
  });

  test('les partages sont ceux du contrat partagé, dans l’ordre du rituel', () => {
    expect(TEAM_SHARES).toEqual(['listeningTitleShared', 'locationShared', 'locationHistoryShared', 'proximityShared']);
  });

  test('accorder un partage n’écrit QUE ce champ, à `true`', async () => {
    const { deps, requests } = fakeTransport({ ok: true, data: { userId: OTHER, locationShared: true } });
    await setPersonSetting(deps, OTHER, 'locationShared', true);
    expect(requests[0]).toMatchObject({ method: 'PUT', path: `/api/v1/relations/${OTHER}/settings`, body: { locationShared: true } });
    expect(Object.keys(requests[0]!.body as object)).toEqual(['locationShared']);
  });

  test('`setReceptionBlocked` reste la porte des trois réglages de réception', async () => {
    expect(setReceptionBlocked).toBe(setPersonSetting);
  });
});
