import { afterEach, describe, expect, test } from 'bun:test';

import { createSendRun, type SendSheetPorts } from '@/lib/send/send-sheet-run';

import { ownedApiDeps, ownedPostMediaUploadDeps } from './owned-deps';
import { IDENTITY_CHANGED, type ApiResult } from './http';
import { uploadMessageAttachment, uploadPostMedia } from './post-media-upload';
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

describe('un téléversement par reprise lancé pour un compte n’est pas un refus quand le compte change (audit #19352, X1)', () => {
  afterEach(() => sessionStore.getState().clearSession({ device: true }));

  const photo = () => new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
  const counted = () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => (calls.push(url), new Response(null, { status: 500 }))) as unknown as typeof fetch;
    return { calls, fetchImpl };
  };

  test('le client TUS rend IDENTITY_CHANGED, sans rien émettre, et jamais un 401 qui ferait échouer l’envoi', async () => {
    sessionStore.getState().establish(ADA);
    const media = ownedPostMediaUploadDeps();
    sessionStore.getState().establish(BOB);
    const { calls, fetchImpl } = counted();

    const post = await uploadPostMedia({ ...media, source: 'gateway', fetchImpl, file: photo(), uploadContext: 'story' });
    const attachment = await uploadMessageAttachment({ ...media, source: 'gateway', fetchImpl, file: photo() });

    expect(post).toMatchObject({ ok: false, status: 0, code: IDENTITY_CHANGED });
    expect(attachment).toMatchObject({ ok: false, status: 0, code: IDENTITY_CHANGED });
    expect(calls).toEqual([]);
  });

  test('sans compte du tout, le refus reste celui d’une authentification absente', async () => {
    const { fetchImpl } = counted();
    const media = ownedPostMediaUploadDeps();

    const post = await uploadPostMedia({ ...media, source: 'gateway', fetchImpl, file: photo(), uploadContext: 'story' });

    expect(post).toMatchObject({ ok: false, status: 401, code: 'UNAUTHORIZED' });
  });

  test('la publication d’un média d’Ada, son compte quitté pendant le téléchargement, retourne en file', async () => {
    sessionStore.getState().establish(ADA);
    const media = { ...ownedPostMediaUploadDeps(), source: 'gateway' as const, ...counted() };
    const unused = async (): Promise<ApiResult<never>> => ({ ok: false, status: 0, error: 'non utilisé' });
    const ports: SendSheetPorts = {
      online: () => true,
      openDirect: unused,
      openGroup: unused,
      forward: unused as unknown as SendSheetPorts['forward'],
      sendMessage: unused,
      uploadFiles: unused,
      fetchFile: async () => (sessionStore.getState().establish(BOB), photo()),
      uploadMedia: (file) => uploadPostMedia({ ...media, file, uploadContext: 'story' }),
      publishMedia: unused,
      publishFromAttachment: unused,
      repost: unused,
      createTextPost: unused,
      newClientMessageId: () => 'cm-1',
    };
    const run = createSendRun({
      entries: [{ key: 'fil', target: { kind: 'publish', as: 'POST' }, steps: [{ kind: 'publish-file', format: 'POST', fileIndex: 0 }] }],
      payload: { kind: 'media', url: 'https://cdn.test/photo.jpg', mime: 'image/jpeg', name: 'photo.jpg', preview: { kind: 'image' } },
      language: 'fr',
      ports,
    });

    await run.start();

    expect(run.getState().statuses).toEqual({ fil: { state: 'queued' } });
    expect(media.calls).toEqual([]);
  });
});
