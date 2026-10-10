import { describe, expect, test } from 'bun:test';

import { openFrontCamera } from './camera';

/**
 * LA CAMÉRA AVANT (#9382) — `getUserMedia`, jamais d'enregistrement : le flux
 * ne sert qu'à l'aperçu et au déclencheur. Chaque refus a SON nom, pour que
 * l'écran dise quoi faire (réautoriser, choisir dans la galerie, garder la
 * carte seule) au lieu d'un échec muet.
 */
const track = () => {
  const state = { stopped: 0 };
  return { state, track: { stop: () => (state.stopped += 1) } };
};

const streamOf = (tracks: readonly { stop: () => void }[]) => ({ getTracks: () => tracks }) as unknown as MediaStream;

describe('openFrontCamera', () => {
  test('demande la caméra AVANT, sans micro, en portrait', async () => {
    const asked: MediaStreamConstraints[] = [];
    const { track: t } = track();
    await openFrontCamera({
      getUserMedia: async (constraints) => {
        asked.push(constraints ?? {});
        return streamOf([t]);
      },
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.audio).toBe(false);
    expect(asked[0]?.video).toMatchObject({ facingMode: 'user' });
  });

  test('un flux obtenu : la session, qui sait s’arrêter', async () => {
    const a = track();
    const b = track();
    const result = await openFrontCamera({ getUserMedia: async () => streamOf([a.track, b.track]) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('session attendue');
    result.session.stop();
    expect(a.state.stopped).toBe(1);
    expect(b.state.stopped).toBe(1);
  });

  test('un navigateur sans caméra programmable : « unsupported »', async () => {
    expect(await openFrontCamera(undefined)).toEqual({ ok: false, reason: 'unsupported' });
  });

  test('l’utilisateur refuse : « denied »', async () => {
    const result = await openFrontCamera({
      getUserMedia: async () => {
        throw new DOMException('refus', 'NotAllowedError');
      },
    });
    expect(result).toEqual({ ok: false, reason: 'denied' });
  });

  test('aucune caméra, ou déjà prise par une autre appli : « unavailable »', async () => {
    for (const name of ['NotFoundError', 'NotReadableError', 'OverconstrainedError']) {
      const result = await openFrontCamera({
        getUserMedia: async () => {
          throw new DOMException('x', name);
        },
      });
      expect(result).toEqual({ ok: false, reason: 'unavailable' });
    }
  });

  test('une erreur inattendue ne s’échappe pas : « unavailable »', async () => {
    const result = await openFrontCamera({
      getUserMedia: async () => {
        throw new Error('boum');
      },
    });
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });
});
