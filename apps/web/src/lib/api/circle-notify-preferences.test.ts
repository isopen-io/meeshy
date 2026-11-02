import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { CIRCLE_NOTIFY_DEFAULTS, CIRCLE_NOTIFY_KEYS } from '@meeshy/shared/utils/relation-levels';

import {
  CIRCLE_NOTIFY_QUERY_KEY,
  decodeCircleNotify,
  loadCircleNotify,
  patchCircleNotify,
  performCircleNotifyEdit,
  type CircleNotifyPreferences,
} from './circle-notify-preferences';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * « QUI EST PRÉVENU » (#14063) — les dix-neuf crans d'entourage
 * (`notification.circle*`, ADR gateway 2026-10-31 #13929) lus et écrits par
 * `GET`/`PATCH /api/v1/me/preferences`, dans la forme que la passerelle sert.
 */

function scripted(responses: ReadonlyArray<ApiResult<unknown>>) {
  const calls: HttpRequest[] = [];
  const queue = [...responses];
  const request = async (req: HttpRequest) => {
    calls.push(req);
    const next = queue.shift();
    if (next === undefined) throw new Error('aucune réponse prévue');
    return next;
  };
  const transport = Object.assign(((req: HttpRequest) => request(req)) as unknown as HttpTransport, { request });
  return { transport, calls };
}

const gateway = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

describe('decodeCircleNotify', () => {
  test('un compte qui n’a rien réglé lit le défaut de chaque famille : Proche, Proche, Sang', () => {
    const decoded = decodeCircleNotify({ notification: {} });
    expect(decoded).toEqual(CIRCLE_NOTIFY_DEFAULTS);
    expect(decoded?.circlePublicationPost).toBe('CLOSE');
    expect(decoded?.circleOnMyContentComment).toBe('CLOSE');
    expect(decoded?.circleElsewhereComment).toBe('BLOOD');
  });

  test('un cran servi remplace le défaut de SA clé seulement', () => {
    const decoded = decodeCircleNotify({ notification: { circlePublicationReel: 'PUBLIC', pushEnabled: true } });
    expect(decoded).toEqual({ ...CIRCLE_NOTIFY_DEFAULTS, circlePublicationReel: 'PUBLIC' });
    expect(Object.keys(decoded ?? {}).sort()).toEqual([...CIRCLE_NOTIFY_KEYS].sort());
  });

  test('un cran inconnu rend la lecture illisible, jamais un défaut deviné', () => {
    expect(decodeCircleNotify({ notification: { circleElsewhereMention: 'EVERYONE' } })).toBeNull();
    expect(decodeCircleNotify('nope')).toBeNull();
  });
});

describe('loadCircleNotify / patchCircleNotify', () => {
  test('la lecture ne demande que les dix-neuf clés d’entourage', async () => {
    const { transport, calls } = scripted([{ ok: true, data: { notification: { circleElsewhereShare: 'FRIEND' } } }]);
    const result = await loadCircleNotify(gateway(transport));
    expect(result).toEqual({ ok: true, data: { ...CIRCLE_NOTIFY_DEFAULTS, circleElsewhereShare: 'FRIEND' } });
    const fields = new URL(`https://x${calls[0]?.path ?? ''}`).searchParams.get('fields')?.split(',') ?? [];
    expect(calls[0]?.method).toBe('GET');
    expect(fields.sort()).toEqual(CIRCLE_NOTIFY_KEYS.map((key) => `notification.${key}`).sort());
  });

  test('l’écriture envoie UNE clé plate sous `notification`, et rend la valeur RETENUE', async () => {
    const { transport, calls } = scripted([
      { ok: true, data: { notification: { ...CIRCLE_NOTIFY_DEFAULTS, circlePublicationStory: 'NOBODY', pushEnabled: true } } },
    ]);
    const result = await patchCircleNotify(gateway(transport), { key: 'circlePublicationStory', value: 'NOBODY' });
    expect(calls[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/me/preferences', body: { notification: { circlePublicationStory: 'NOBODY' } } });
    expect(result).toEqual({ ok: true, data: 'NOBODY' });
  });
});

describe('performCircleNotifyEdit — optimiste, retour arrière sur refus', () => {
  const seeded = (): QueryClient => {
    const client = new QueryClient();
    client.setQueryData<CircleNotifyPreferences>(CIRCLE_NOTIFY_QUERY_KEY, CIRCLE_NOTIFY_DEFAULTS);
    return client;
  };

  test('le cran change avant la réponse, et la réponse le confirme', async () => {
    const client = seeded();
    let release: (value: ApiResult<unknown>) => void = () => undefined;
    const request = () => new Promise<ApiResult<unknown>>((resolve) => (release = resolve));
    const transport = Object.assign(request as unknown as HttpTransport, { request });
    const pending = performCircleNotifyEdit({
      key: 'circleOnMyContentReaction',
      value: 'FRIEND',
      deps: { source: 'gateway', transport, queryClient: client, isOnline: () => true },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getQueryData<CircleNotifyPreferences>(CIRCLE_NOTIFY_QUERY_KEY)?.circleOnMyContentReaction).toBe('FRIEND');
    release({ ok: true, data: { notification: { circleOnMyContentReaction: 'FRIEND' } } });
    expect(await pending).toEqual({ status: 'saved' });
    expect(client.getQueryData<CircleNotifyPreferences>(CIRCLE_NOTIFY_QUERY_KEY)?.circleOnMyContentReaction).toBe('FRIEND');
  });

  test('un refus rend l’ancien cran, et seulement celui du geste', async () => {
    const client = seeded();
    const { transport } = scripted([{ ok: false, status: 500, error: 'boom' }]);
    client.setQueryData<CircleNotifyPreferences>(CIRCLE_NOTIFY_QUERY_KEY, { ...CIRCLE_NOTIFY_DEFAULTS, circlePublicationPost: 'PUBLIC' });
    const outcome = await performCircleNotifyEdit({
      key: 'circleElsewhereComment',
      value: 'COMMUNITY',
      deps: { source: 'gateway', transport, queryClient: client, isOnline: () => true },
    });
    expect(outcome).toEqual({ status: 'refused', error: 'boom' });
    const after = client.getQueryData<CircleNotifyPreferences>(CIRCLE_NOTIFY_QUERY_KEY);
    expect(after?.circleElsewhereComment).toBe('BLOOD');
    expect(after?.circlePublicationPost).toBe('PUBLIC');
  });

  test('hors ligne, rien ne part et rien ne change', async () => {
    const client = seeded();
    const { transport, calls } = scripted([]);
    const outcome = await performCircleNotifyEdit({
      key: 'circlePublicationMood',
      value: 'NOBODY',
      deps: { source: 'gateway', transport, queryClient: client, isOnline: () => false },
    });
    expect(outcome).toEqual({ status: 'offline' });
    expect(calls).toEqual([]);
    expect(client.getQueryData<CircleNotifyPreferences>(CIRCLE_NOTIFY_QUERY_KEY)?.circlePublicationMood).toBe('CLOSE');
  });
});
