import { describe, expect, test } from 'bun:test';

import { acquireCamera, type CameraStreamLike, type CameraTrackLike } from '@/lib/stories/studio-camera-open';

/**
 * #10308 — **BASCULER AVANT ↔ ARRIÈRE NE FIGE PLUS LE FLUX** : la piste vidéo
 * précédente s'arrête AVANT d'en demander une autre (un téléphone n'ouvre pas
 * deux capteurs à la fois — la seconde demande échouait ou rendait l'ancienne
 * image), la nouvelle caméra est demandée EXACTEMENT (une préférence laissait
 * le navigateur rendre la même optique), et le micro déjà ouvert est GARDÉ :
 * aucune renégociation du son à chaque bascule (#10307).
 */

type Journal = string[];

function track(kind: 'audio' | 'video', name: string, journal: Journal): CameraTrackLike {
  return { kind, stop: () => journal.push(`stop:${name}`) };
}

function stream(tracks: readonly CameraTrackLike[]): CameraStreamLike {
  return {
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  };
}

function overconstrained(): Error {
  const error = new Error('no such camera');
  error.name = 'OverconstrainedError';
  return error;
}

describe('acquireCamera — la première ouverture', () => {
  test('demande la vidéo de l’optique voulue ET le micro, d’un seul geste', async () => {
    const journal: Journal = [];
    const asked: MediaStreamConstraints[] = [];
    const opened = stream([track('video', 'back', journal), track('audio', 'mic', journal)]);
    const result = await acquireCamera({
      facing: 'environment',
      request: async (constraints) => {
        asked.push(constraints);
        return opened;
      },
      assemble: stream,
    });
    expect(result).toBe(opened);
    expect(asked).toEqual([{ video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: true }]);
  });
});

describe('acquireCamera — la bascule', () => {
  test('la piste vidéo précédente s’arrête AVANT la demande, le micro reste ouvert et rejoint le nouveau flux', async () => {
    const journal: Journal = [];
    const mic = track('audio', 'mic', journal);
    const previous = stream([track('video', 'back', journal), mic]);
    const front = track('video', 'front', journal);
    const asked: MediaStreamConstraints[] = [];
    const result = await acquireCamera({
      facing: 'user',
      previous,
      request: async (constraints) => {
        journal.push('request');
        asked.push(constraints);
        return stream([front]);
      },
      assemble: stream,
    });
    expect(journal).toEqual(['stop:back', 'request']);
    expect(asked).toEqual([{ video: { facingMode: { exact: 'user' }, width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: false }]);
    expect(result.getVideoTracks()).toEqual([front]);
    expect(result.getAudioTracks()).toEqual([mic]);
  });

  test('aucune optique ne répond EXACTEMENT : repli sur la préférence, sans redemander le micro', async () => {
    const journal: Journal = [];
    const previous = stream([track('video', 'back', journal), track('audio', 'mic', journal)]);
    const asked: MediaStreamConstraints[] = [];
    const result = await acquireCamera({
      facing: 'user',
      previous,
      request: async (constraints) => {
        asked.push(constraints);
        if (asked.length === 1) throw overconstrained();
        return stream([track('video', 'any', journal)]);
      },
      assemble: stream,
    });
    expect(asked.map((c) => c.audio)).toEqual([false, false]);
    expect(asked[1]?.video).toEqual({ facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } });
    expect(result.getAudioTracks()).toHaveLength(1);
  });

  test('un refus autre que l’optique introuvable remonte tel quel', async () => {
    const journal: Journal = [];
    const previous = stream([track('video', 'back', journal)]);
    const denied = new Error('denied');
    denied.name = 'NotAllowedError';
    const caught = await acquireCamera({
      facing: 'user',
      previous,
      request: async () => {
        throw denied;
      },
      assemble: stream,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(caught).toBe(denied);
  });
});
