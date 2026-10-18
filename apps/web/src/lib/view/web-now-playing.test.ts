import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import type { NowPlayingState } from './shell-playback';
import { webPlaybackHold, type MediaSessionPort, type NowPlayingWording } from './web-now-playing';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * **DANS LE NAVIGATEUR, LA NOTIFICATION D'UN VOCAL DIT QUI PARLE ET SE PILOTE**
 * (#10890) — la coque Android a sa carte de lecture (#10624) : l'auteur, la
 * conversation et la date, l'avatar, la barre et les ±15 s. Chrome Android,
 * Chrome de bureau et Edge n'affichaient que leur carte générique « Meeshy ».
 * La Media Session API porte les MÊMES faits, par le MÊME `PlaybackHold`.
 */

type Handler = (details: MediaSessionActionDetails) => void;

type FakeMetadata = MediaMetadataInit;

const fakeSession = () => {
  const handlers = new Map<MediaSessionAction, Handler>();
  const positions: (MediaPositionState | undefined)[] = [];
  const session: MediaSessionPort<FakeMetadata> = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: (action, handler) => {
      if (handler === null) handlers.delete(action);
      else handlers.set(action, handler);
    },
    setPositionState: (state) => {
      positions.push(state);
    },
  };
  const fire = (action: MediaSessionAction, details: Partial<MediaSessionActionDetails> = {}): void => {
    handlers.get(action)?.({ action, ...details });
  };
  return { session, handlers, positions, fire };
};

const wording: NowPlayingWording = { locale: 'fr', voiceMessage: 'Message vocal', protectedMessage: 'Message protégé' };

const SENT_AT = Date.parse('2026-10-14T09:30:00.000Z');

const state = (overrides: Partial<NowPlayingState> = {}): NowPlayingState => ({
  key: 'att-1',
  sender: 'Nour',
  conversation: 'Famille',
  sentAtMs: SENT_AT,
  artworkUrl: 'https://cdn.test/nour.jpg',
  protected: false,
  durationMs: 12_000,
  positionMs: 3_000,
  rate: 1,
  playing: true,
  buffering: false,
  canNext: false,
  canPrevious: false,
  ...overrides,
});

const holdOn = (session: MediaSessionPort<FakeMetadata>, now: () => number = () => 0) =>
  webPlaybackHold(session, { wording: () => wording, makeMetadata: (init) => init, now });

const dateCourte = new Intl.DateTimeFormat('fr', { dateStyle: 'short', timeStyle: 'short' }).format(SENT_AT);

describe('la carte de lecture du navigateur (#10890)', () => {
  test('un vocal de conversation : « {conversation} — {date} », l’auteur, la conversation et l’avatar', () => {
    const { session, positions } = fakeSession();
    const hold = holdOn(session);
    hold.hold();
    hold.update(state());
    expect(session.metadata).toEqual({
      title: `Famille — ${dateCourte}`,
      artist: 'Nour',
      album: 'Famille',
      artwork: [{ src: 'https://cdn.test/nour.jpg' }],
    });
    expect(session.playbackState).toBe('playing');
    expect(positions.at(-1)).toEqual({ duration: 12, position: 3, playbackRate: 1 });
  });

  test('un vocal protégé ne dit que son auteur et « Message protégé », sans image', () => {
    const { session } = fakeSession();
    holdOn(session).update(state({ protected: true, conversation: null, sentAtMs: null, artworkUrl: null }));
    expect(session.metadata).toEqual({ title: 'Nour', artist: 'Message protégé', album: '', artwork: [] });
  });

  test('hors conversation, l’auteur seul ; sans auteur, « Message vocal »', () => {
    const { session } = fakeSession();
    const hold = holdOn(session);
    hold.update(state({ conversation: null, sentAtMs: null, artworkUrl: null }));
    expect(session.metadata).toEqual({ title: 'Nour', artist: '', album: '', artwork: [] });
    hold.update(state({ sender: null, conversation: null, sentAtMs: null, artworkUrl: null }));
    expect(session.metadata).toEqual({ title: 'Message vocal', artist: '', album: '', artwork: [] });
  });

  test('pause, lecture et barre reviennent à la page par le même `PlaybackHold` que la coque', () => {
    const { session, fire } = fakeSession();
    const hold = holdOn(session);
    const gestes: string[] = [];
    hold.onPauseRequested(() => gestes.push('pause'));
    hold.onPlayRequested(() => gestes.push('play'));
    hold.onSeekRequested((positionMs) => gestes.push(`seek:${positionMs}`));
    hold.hold();
    hold.update(state());
    fire('pause');
    fire('play');
    fire('seekto', { seekTime: 7.5 });
    expect(gestes).toEqual(['pause', 'play', 'seek:7500']);
  });

  test('les ±15 s partent de la position extrapolée, bornée à la durée', () => {
    const { session, fire } = fakeSession();
    let horloge = 1_000;
    const hold = holdOn(session, () => horloge);
    const sauts: number[] = [];
    hold.onSeekRequested((positionMs) => sauts.push(positionMs));
    hold.hold();
    hold.update(state({ durationMs: 60_000, positionMs: 10_000, rate: 2 }));
    horloge = 3_000;
    fire('seekforward');
    fire('seekbackward');
    fire('seekbackward', { seekOffset: 5 });
    hold.update(state({ durationMs: 60_000, positionMs: 55_000, playing: false }));
    fire('seekforward');
    expect(sauts).toEqual([29_000, 0, 9_000, 60_000]);
  });

  test('une pause garée garde la carte, la lecture rendue rend la main au navigateur', () => {
    const { session, handlers } = fakeSession();
    const hold = holdOn(session);
    hold.onPauseRequested(() => {});
    hold.onPlayRequested(() => {});
    hold.onSeekRequested(() => {});
    hold.hold();
    hold.update(state());
    hold.park();
    expect(session.playbackState).toBe('paused');
    expect(session.metadata).not.toBeNull();
    expect(handlers.size).toBeGreaterThan(0);
    hold.release();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect(handlers.size).toBe(0);
  });

  test('une position invalide pour le navigateur ne casse jamais la lecture', () => {
    const { session } = fakeSession();
    const refuse: MediaSessionPort<FakeMetadata> = {
      ...session,
      setPositionState: () => {
        throw new TypeError('position hors durée');
      },
    };
    expect(() => holdOn(refuse).update(state())).not.toThrow();
    expect(refuse.metadata).not.toBeNull();
  });

  test('le navigateur démarre la carte au lancement, hors coque ; la coque garde la sienne', () => {
    const main = readFileSync(join(HERE, '..', '..', 'main.tsx'), 'utf8');
    const debut = main.indexOf("import('@/lib/view/web-now-playing')");
    expect(debut).toBeGreaterThan(-1);
    const garde = main.lastIndexOf('if (', debut);
    expect(main.slice(garde, debut)).toContain('!__SHELL__');
    expect(main.slice(garde, debut)).toContain('mediaSession');
  });

  test('la bulle d’un vocal se décrit aussi dans un navigateur qui sert la Media Session', () => {
    const hook = readFileSync(join(HERE, 'use-voice-now-playing.ts'), 'utf8');
    expect(hook).toMatch(/__SHELL__ \|\| .*mediaSession/);
  });
});
