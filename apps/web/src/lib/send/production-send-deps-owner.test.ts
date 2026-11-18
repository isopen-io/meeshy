import { afterEach, describe, expect, test } from 'bun:test';

import { IDENTITY_CHANGED, createHttpTransport, type HttpTransport } from '@/lib/api/http';
import type { PostMediaUploadDeps } from '@/lib/api/post-media-upload';
import { ownedSendDeps } from '@/lib/api/query';
import { currentCredential, currentIdentity } from '@/lib/api/client';
import { sessionStore } from '@/lib/api/session';
import { liveTalkieCopier } from '@/routes/user-profile-talkie';

import { durableSendDeps } from './outbox-durability-instance';
import { sendSheetDepsOf } from './send-sheet-ports';

/**
 * LE CÂBLAGE DE PRODUCTION DES ENVOIS EN PLUSIEURS REQUÊTES (audit #19352, X1).
 * Les témoins du mécanisme construisaient eux-mêmes des ports liés : remettre
 * la production sur `apiDeps` / `postMediaUploadDeps` ne rougissait rien. Ici,
 * chaque fabrique de PRODUCTION est prise sous Ada, l'onglet passe à Bob, et
 * la requête suivante est refusée avant d'émettre : rien ne part du réseau.
 */
const signIn = (id: string): void =>
  sessionStore.getState().establish({ user: { id, username: id }, token: `jwt-${id}`, sessionToken: `sess-${id}`, expiresIn: 3600 });

afterEach(() => sessionStore.getState().clearSession({ device: true }));

const refusedUnderBob = async (transport: HttpTransport): Promise<string | undefined> => {
  signIn('u-bob');
  const result = await transport.request({ method: 'GET', path: '/api/v1/conversations' });
  return result.ok ? 'émise' : result.code;
};

const mediaFollowsOwner = (media: PostMediaUploadDeps) => ({ credential: media.credential(), identityChanged: media.identityChanged?.() });

describe('les fabriques de production des envois sont liées au compte qui les lance', () => {
  test('la feuille d’envoi (ses dépendances par défaut) : transport et téléversement restent à Ada', async () => {
    signIn('u-ada');
    const { deps, media } = sendSheetDepsOf({});

    expect(await refusedUnderBob(deps.transport)).toBe(IDENTITY_CHANGED);
    expect(mediaFollowsOwner(media)).toEqual({ credential: null, identityChanged: true });
  });

  test('la reprise de la file durable du fil : transport et téléversement restent à Ada', async () => {
    signIn('u-ada');
    const deps = durableSendDeps();

    expect(await refusedUnderBob(deps.transport)).toBe(IDENTITY_CHANGED);
    expect(mediaFollowsOwner(deps.transfer.media!)).toEqual({ credential: null, identityChanged: true });
  });

  test('le composeur du fil (envoi et réessai) : transport et téléversement restent à Ada', async () => {
    signIn('u-ada');
    const deps = ownedSendDeps(true);

    expect(await refusedUnderBob(deps.transport)).toBe(IDENTITY_CHANGED);
    expect(mediaFollowsOwner(deps.transfer!.media!)).toEqual({ credential: null, identityChanged: true });
  });

  const gatewayRecording = () => {
    const emitted: Array<string | null> = [];
    const deps = {
      source: 'gateway' as const,
      transport: createHttpTransport({
        base: '',
        credential: currentCredential,
        identity: currentIdentity,
        fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
          emitted.push(new Headers(init?.headers).get('Authorization'));
          return new Response(JSON.stringify({ success: false, error: 'refus' }), { status: 422 });
        }) as typeof fetch,
      }),
    };
    return { emitted, deps };
  };
  const voiceOf = (owner: string | null) => ({ frames: [new Uint8Array([1, 2, 3])], durationMs: 400, toUserId: 'u-proche', conversationId: null, owner });

  test('la copie vocale du talkie parle par la passerelle, au nom de qui a appuyé', async () => {
    const { emitted, deps } = gatewayRecording();
    signIn('u-ada');

    await liveTalkieCopier(() => 'fr', deps)(voiceOf(currentIdentity()));

    expect(emitted.length).toBeGreaterThan(0);
    expect(new Set(emitted)).toEqual(new Set(['Bearer jwt-u-ada']));
  });

  test('la copie vocale du talkie : rien ne part quand l’onglet a changé de compte depuis l’appui', async () => {
    const { emitted, deps } = gatewayRecording();
    signIn('u-ada');
    const owner = currentIdentity();
    signIn('u-bob');

    const sent = await liveTalkieCopier(() => 'fr', deps)(voiceOf(owner));

    expect(emitted).toEqual([]);
    expect(sent).toBe(false);
  });
});
