import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { BackgroundTrack } from '@/lib/canvas/background-sound';
import { protectedMediaDeps, type ProtectedMediaDeps } from '@/lib/api/protected-media';

import { BackgroundTrackAudio, defaultMediaDeps } from './background-track-audio';
import type { SceneClockHandle } from './scene-clock';

/**
 * T5 (#6903) — `BackgroundTrackAudio`, SITE UNIQUE du son de fond d'une
 * scène, extrait de `story-scene-layer.tsx` pour être consommé aussi par le
 * lecteur des Réels. Patron `use-reel-playback.test.tsx:26-45` (happy-dom +
 * `createRoot` + `act`, `play`/`pause` bouchonnés sur le PROTOTYPE).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let playImpl: () => Promise<void> = () => Promise.resolve();
let playCalls = 0;
let pauseCalls = 0;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    playCalls += 1;
    return playImpl();
  };
  window.HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    pauseCalls += 1;
  };
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  playCalls = 0;
  pauseCalls = 0;
  playImpl = () => Promise.resolve();
});

function mount(node: ReactElement): HTMLDivElement {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

const trackOf = (overrides: Partial<BackgroundTrack> = {}): BackgroundTrack => ({
  src: 'son.webm',
  volume: 1,
  startOffsetMs: 0,
  loop: false,
  ...overrides,
});

function audioOf(root: HTMLDivElement): HTMLAudioElement {
  const el = root.querySelector('[data-scene-sound-track]');
  if (el === null) throw new Error('aucune piste montée');
  return el as HTMLAudioElement;
}

describe('BackgroundTrackAudio — le son de fond, site unique (T5, #6903)', () => {
  test('(a) playing ⇒ play() une fois ; playing faux ⇒ pause()', () => {
    mount(<BackgroundTrackAudio track={trackOf()} playing muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    expect(playCalls).toBe(1);
    act(() => {
      root.render(<BackgroundTrackAudio track={trackOf()} playing={false} muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    });
    expect(pauseCalls).toBe(1);
  });

  test('(b) muted ⇒ attribut muted posé, play() TOUT DE MÊME appelé (une lecture muette avance)', () => {
    const el = mount(<BackgroundTrackAudio track={trackOf()} playing muted onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    expect(audioOf(el).muted).toBe(true);
    expect(playCalls).toBe(1);
  });

  test('(c) refus NotAllowedError, muted faux ⇒ onPlaybackBlocked appelé', async () => {
    let blocked = 0;
    playImpl = () => Promise.reject(Object.assign(new Error('refused'), { name: 'NotAllowedError' }));
    await act(async () => {
      mount(<BackgroundTrackAudio track={trackOf()} playing muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => (blocked += 1)} />);
    });
    await act(async () => {});
    expect(blocked).toBe(1);
  });

  test('(c bis) refus NotAllowedError, muted vrai ⇒ onPlaybackBlocked PAS appelé', async () => {
    let blocked = 0;
    playImpl = () => Promise.reject(Object.assign(new Error('refused'), { name: 'NotAllowedError' }));
    await act(async () => {
      mount(<BackgroundTrackAudio track={trackOf()} playing muted onDurationKnown={() => {}} onPlaybackBlocked={() => (blocked += 1)} />);
    });
    await act(async () => {});
    expect(blocked).toBe(0);
  });

  test('(d) key changée ⇒ nouvel élément, play() DE NOUVEAU (le redépart d’un tour)', () => {
    mount(<BackgroundTrackAudio key="a" track={trackOf()} playing muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    expect(playCalls).toBe(1);
    act(() => {
      root.render(<BackgroundTrackAudio key="b" track={trackOf()} playing muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    });
    expect(playCalls).toBe(2);
  });

  test('(e) loadedmetadata (durée stubée 2 s) ⇒ onDurationKnown(startOffsetMs + 2000)', () => {
    const durations: number[] = [];
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ startOffsetMs: 500 })}
        playing
        muted={false}
        onDurationKnown={(ms) => durations.push(ms)}
        onPlaybackBlocked={() => {}}
      />,
    );
    const audio = audioOf(el);
    Object.defineProperty(audio, 'duration', { value: 2, configurable: true });
    act(() => {
      audio.dispatchEvent(new window.Event('loadedmetadata'));
    });
    expect(durations).toEqual([2500]);
  });

  test('(f) bounds ⇒ currentTime = start au chargement ; au-delà de end ⇒ pause (sans loop)', () => {
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ bounds: { startMs: 1000, endMs: 3000 } })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
      />,
    );
    const audio = audioOf(el);
    Object.defineProperty(audio, 'duration', { value: 9, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 0, configurable: true, writable: true });
    act(() => {
      audio.dispatchEvent(new window.Event('loadedmetadata'));
    });
    expect(audio.currentTime).toBe(1);
    audio.currentTime = 3.1;
    const pausedBefore = pauseCalls;
    act(() => {
      audio.dispatchEvent(new window.Event('timeupdate'));
    });
    expect(pauseCalls).toBeGreaterThan(pausedBefore);
  });

  test('(f bis) bounds + loop ⇒ au-delà de end, REBOUCLE au début de la fenêtre au lieu de pauser', () => {
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ bounds: { startMs: 1000, endMs: 3000 }, loop: true })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
      />,
    );
    const audio = audioOf(el);
    Object.defineProperty(audio, 'duration', { value: 9, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 0, configurable: true, writable: true });
    act(() => {
      audio.dispatchEvent(new window.Event('loadedmetadata'));
    });
    audio.currentTime = 3.1;
    const pausedBefore = pauseCalls;
    act(() => {
      audio.dispatchEvent(new window.Event('timeupdate'));
    });
    expect(audio.currentTime).toBe(1);
    expect(pauseCalls).toBe(pausedBefore);
  });

  test('(g) [data-scene-sound-track] posé — le gate de story le lit', () => {
    const el = mount(<BackgroundTrackAudio track={trackOf()} playing muted={false} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    expect(el.querySelector('[data-scene-sound-track]')).not.toBeNull();
  });
});

/**
 * #7015 — LA PISTE SERVIE PAR LA ROUTE AUTHENTIFIÉE.
 *
 * Mesuré en production : `GET /api/v1/static/<uuid>.m4a` rend **401**, et une
 * balise `<audio src>` n'envoie aucun en-tête. Poser l'URL protégée en `src`
 * ne produit donc JAMAIS de son sur le web — seulement un `net::ERR_FAILED` et
 * un `no-response` de service worker par lecture. Les octets passent désormais
 * par `fetch` (le seul transport qui porte un en-tête) et l'élément reçoit une
 * URL d'OBJET.
 */
const SON_PROTEGE = 'https://gate.meeshy.me/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a';

/**
 * LE TYPE QUE LA ROUTE SERT (revue-correction #7015) — `audio/x-m4a` pour un
 * `.m4a`, la carte `EXT_TO_MIME` du gateway. Le fixture le PORTE parce que
 * `fetchProtectedObjectUrl` le VÉRIFIE désormais : un corps non vide en `200`
 * ne suffit pas, sans quoi l'`index.html` du SPA (servi `200 text/html` dès
 * que `apiConfig.base` est vide hors proxy) devenait une URL d'objet posée en
 * `<audio src>` — pas de son, et pas de `null` non plus, donc aucune
 * dégradation.
 */
const AUDIO_SERVI = 'audio/x-m4a';

function depsDeTest(
  options: { readonly resolved?: string | null; readonly revoked?: string[]; readonly typeServi?: string } = {},
): ProtectedMediaDeps {
  return {
    credential: () => ({ kind: 'registered', token: 'jwt-1' }),
    fetchImpl: (() =>
      Promise.resolve(
        options.resolved === null
          ? new Response('', { status: 401 })
          : new Response(new Blob(['octets'], { type: options.typeServi ?? AUDIO_SERVI }), { status: 200 }),
      )) as typeof fetch,
    createObjectURL: () => options.resolved ?? 'blob:meeshy/son',
    revokeObjectURL: (url) => {
      options.revoked?.push(url);
    },
  };
}

describe('BackgroundTrackAudio — la piste PROTÉGÉE (#7015)', () => {
  test('(h) l’URL protégée n’est JAMAIS posée en `src` — l’élément reçoit une URL d’objet', async () => {
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ src: SON_PROTEGE })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
        mediaDeps={depsDeTest()}
      />,
    );
    // Avant résolution : aucune balise, donc aucune requête anonyme au 401.
    expect(el.querySelector('[data-scene-sound-track]')).toBeNull();
    await act(async () => {});
    const audio = audioOf(el);
    expect(audio.getAttribute('src')).toBe('blob:meeshy/son');
    expect(audio.getAttribute('src')).not.toContain('/api/v1/static/');
    // La piste joue : c'est le critère de fin de #7015.
    expect(playCalls).toBe(1);
  });

  test('(i) refus de la passerelle ⇒ AUCUNE piste, aucune promesse rejetée', async () => {
    const rejets: unknown[] = [];
    const noter = (reason: unknown) => rejets.push(reason);
    process.on('unhandledRejection', noter);
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ src: SON_PROTEGE })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
        mediaDeps={depsDeTest({ resolved: null })}
      />,
    );
    await act(async () => {});
    await new Promise((resolve) => setImmediate(resolve));
    process.off('unhandledRejection', noter);
    expect(el.querySelector('[data-scene-sound-track]')).toBeNull();
    expect(rejets).toEqual([]);
  });

  test('(j) démontage ⇒ l’URL d’objet est RÉVOQUÉE (les octets ne restent pas en mémoire)', async () => {
    const revoked: string[] = [];
    mount(
      <BackgroundTrackAudio
        track={trackOf({ src: SON_PROTEGE })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
        mediaDeps={depsDeTest({ revoked })}
      />,
    );
    await act(async () => {});
    act(() => {
      root.render(<span />);
    });
    expect(revoked).toEqual(['blob:meeshy/son']);
  });

  test('(k) CONTRASTE — une source non protégée reste posée TELLE QUELLE, sans requête', () => {
    let appels = 0;
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ src: 'https://cdn.test/track.mp3' })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
        mediaDeps={{
          ...depsDeTest(),
          fetchImpl: (() => {
            appels += 1;
            return Promise.resolve(new Response('', { status: 200 }));
          }) as typeof fetch,
        }}
      />,
    );
    expect(audioOf(el).getAttribute('src')).toBe('https://cdn.test/track.mp3');
    expect(appels).toBe(0);
  });

  test('(l) LA LOI EST BRANCHÉE — sans `mediaDeps`, le composant prend les dépendances de PRODUCTION', () => {
    expect(defaultMediaDeps).toBe(protectedMediaDeps);
  });

  test('(n) refus (401) ⇒ onUnavailable(\'refused\') appelé UNE fois, aucune balise (revue-correction #7015, défaut 2)', async () => {
    const raisons: unknown[] = [];
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ src: SON_PROTEGE })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
        onUnavailable={(reason) => raisons.push(reason)}
        mediaDeps={depsDeTest({ resolved: null })}
      />,
    );
    await act(async () => {});
    expect(el.querySelector('[data-scene-sound-track]')).toBeNull();
    expect(raisons).toEqual(['refused']);
  });

  test('(o) une piste RÉSOLUE (`ready`) ⇒ onUnavailable JAMAIS appelé', async () => {
    const raisons: unknown[] = [];
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ src: SON_PROTEGE })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
        onUnavailable={(reason) => raisons.push(reason)}
        mediaDeps={depsDeTest()}
      />,
    );
    await act(async () => {});
    expect(el.querySelector('[data-scene-sound-track]')).not.toBeNull();
    expect(raisons).toEqual([]);
  });

  test('(p) un `200` qui n’est pas de l’audio ⇒ onUnavailable(\'missing\') — le PIXEL ET la raison', async () => {
    const raisons: unknown[] = [];
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ src: SON_PROTEGE })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
        onUnavailable={(reason) => raisons.push(reason)}
        mediaDeps={depsDeTest({ typeServi: 'text/html' })}
      />,
    );
    await act(async () => {});
    expect(el.querySelector('[data-scene-sound-track]')).toBeNull();
    expect(raisons).toEqual(['missing']);
  });

  test('(m) le SPA qui répond `200 text/html` ⇒ AUCUNE piste montée (jusqu’au PIXEL)', async () => {
    const el = mount(
      <BackgroundTrackAudio
        track={trackOf({ src: SON_PROTEGE })}
        playing
        muted={false}
        onDurationKnown={() => {}}
        onPlaybackBlocked={() => {}}
        mediaDeps={depsDeTest({ typeServi: 'text/html' })}
      />,
    );
    await act(async () => {});
    // Le défaut qu'il attrape : une URL d'objet DE HTML posée en `<audio src>`
    // montait la balise, `readyState` restait 0, et rien — ni son, ni erreur,
    // ni dégradation — ne le disait. Ce témoin s'arrête au PIXEL : pas de
    // balise du tout.
    expect(el.querySelector('[data-scene-sound-track]')).toBeNull();
    expect(playCalls).toBe(0);
  });
});

/** Une horloge de scène RÉDUITE à ce que la piste écoute : les seeks (#7879). */
function seekOnlyClock(): { readonly clock: SceneClockHandle; readonly seek: (t: number) => void } {
  const listeners = new Set<(t: number) => void>();
  const seek = (t: number) => act(() => listeners.forEach((listener) => listener(t)));
  const clock: SceneClockHandle = {
    subscribe: () => () => undefined,
    subscribeSeek: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    seek,
    now: () => 0,
    isDriving: () => false,
  };
  return { clock, seek };
}

describe('BackgroundTrackAudio — le parcours au doigt (#7879)', () => {
  test('un seek cale la piste dans sa fenêtre, depuis son départ différé', () => {
    const { clock, seek } = seekOnlyClock();
    const track = trackOf({ startOffsetMs: 1000, loop: true, bounds: { startMs: 2000, endMs: 6000 } });
    const el = mount(<BackgroundTrackAudio track={track} playing={false} muted={false} clock={clock} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    const audio = audioOf(el);
    Object.defineProperty(audio, 'duration', { value: 10, configurable: true });
    seek(3);
    expect(audio.currentTime).toBeCloseTo(4, 5);
  });

  test('pointer AVANT le départ différé ramène la piste au début de sa fenêtre', () => {
    const { clock, seek } = seekOnlyClock();
    const track = trackOf({ startOffsetMs: 2000, loop: true, bounds: { startMs: 2000, endMs: 6000 } });
    const el = mount(<BackgroundTrackAudio track={track} playing={false} muted={false} clock={clock} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    const audio = audioOf(el);
    Object.defineProperty(audio, 'duration', { value: 10, configurable: true });
    audio.currentTime = 5;
    seek(1);
    expect(audio.currentTime).toBeCloseTo(2, 5);
  });

  test('pointer APRÈS le départ différé : la reprise joue TOUT DE SUITE, sans rejouer le délai', () => {
    const { clock, seek } = seekOnlyClock();
    const track = trackOf({ startOffsetMs: 2000, loop: true, bounds: { startMs: 2000, endMs: 6000 } });
    const el = mount(<BackgroundTrackAudio track={track} playing={false} muted={false} clock={clock} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    Object.defineProperty(audioOf(el), 'duration', { value: 10, configurable: true });
    seek(3);
    act(() => {
      root.render(<BackgroundTrackAudio track={track} playing muted={false} clock={clock} onDurationKnown={() => {}} onPlaybackBlocked={() => {}} />);
    });
    expect(playCalls).toBe(1);
  });
});
