import { afterEach, describe, expect, test } from 'bun:test';

import { ownedApiDeps, ownedPostMediaUploadDeps } from './deps';
import { IDENTITY_CHANGED } from './http';
import { sessionStore } from './session';

const ADA = { user: { id: 'u-ada', username: 'ada' }, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 } as const;
const BOB = { user: { id: 'u-bob', username: 'bob' }, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 } as const;

describe('les dépendances d’une opération restent au compte qui l’a lancée (audit #19352, X1)', () => {
  afterEach(() => sessionStore.getState().clearSession({ device: true }));

  test('le transport JSON n’émet plus rien une fois l’appareil passé à un autre compte', async () => {
    sessionStore.getState().establish(ADA);
    const deps = ownedApiDeps();
    sessionStore.getState().establish(BOB);

    const result = await deps.transport.request({ method: 'POST', path: '/posts', body: { content: 'Le texte d’Ada' } });

    expect(result).toMatchObject({ ok: false, status: 0, code: IDENTITY_CHANGED });
  });

  test('le client TUS ne présente plus aucun jeton une fois l’appareil passé à un autre compte', () => {
    sessionStore.getState().establish(ADA);
    const media = ownedPostMediaUploadDeps();
    const underAda = media.credential();
    sessionStore.getState().establish(BOB);

    expect(underAda).toEqual({ kind: 'registered', token: 'jwt-ada' });
    expect(media.credential()).toBeNull();
  });
});
