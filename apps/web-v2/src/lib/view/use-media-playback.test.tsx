import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createHttpTransport } from '@/lib/api/http';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { createMediaCoordinator, type MediaCoordinator } from './media-coordinator';
import { useMediaPlayback, type MediaPlayback } from './use-media-playback';

/**
 * TÉMOIN (#5805, renommé #6221 étape 0 — `use-audio-playback.test.tsx`).
 * Patron `use-recorder.test.tsx` (happy-dom + `createRoot` + `act`).
 * L'élément est RÉEL (`<audio>` ou `<video>`), mais `play`/`pause`/`load`
 * sont BOUCHONNÉS sur CHAQUE instance (`stubMedia`) : happy-dom implémente
 * ces méthodes en suivant un état interne `paused` qui ne reflète pas
 * nécessairement ce que le hook vient de faire dans un test qui compose
 * plusieurs éléments — le bouchon rend chaque test indépendant de ce détail
 * d'implémentation, exactement la forme que la spécification prescrit (§4.5).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
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
});

type HarnessReport = {
  readonly kind: 'listened' | 'watched';
  readonly durationMs?: number;
  readonly resume?: { readonly positionMs: number | null; readonly complete: boolean };
  readonly deps: ConversationsDeps;
};

function Harness({
  onReady,
  attachmentId,
  coordinator,
  tag = 'audio',
  tracksTime = false,
  report,
}: {
  readonly onReady: (playback: MediaPlayback) => void;
  readonly attachmentId: string;
  readonly coordinator: MediaCoordinator;
  readonly tag?: 'audio' | 'video';
  readonly tracksTime?: boolean;
  readonly report?: HarnessReport;
}) {
  const playback = useMediaPlayback({ attachmentId, coordinator, tracksTime, ...(report !== undefined ? { report } : {}) });
  onReady(playback);
  const data = {
    'data-status': playback.status,
    'data-progress': playback.progress,
    'data-position': playback.position,
    'data-duration': playback.duration,
    'data-muted': String(playback.muted),
    'data-rate': playback.rate,
    'data-pip': playback.pictureInPicture,
    'data-reported-fraction': String(playback.reportedFraction),
    'data-reported-complete': String(playback.reportedComplete),
  };
  if (tag === 'video') {
    return <video ref={playback.bind} {...data} />;
  }
  return <audio ref={playback.bind} {...data} />;
}

function mount(params: {
  readonly onReady: (playback: MediaPlayback) => void;
  readonly attachmentId: string;
  readonly coordinator: MediaCoordinator;
  readonly tag?: 'audio' | 'video';
  readonly tracksTime?: boolean;
  readonly report?: HarnessReport;
}): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness {...params} />);
  });
  return container;
}

/** Bouchon de dépendances réseau — même patron que `fakeFetch` (`attachments.test.ts`). */
function fakeReportDeps(): { readonly deps: ConversationsDeps; readonly calls: { readonly url: string; readonly init: RequestInit }[] } {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
  }) as typeof fetch;
  const transport = createHttpTransport({ base: '', fetchImpl });
  return { deps: { source: 'gateway', transport }, calls };
}

const bodyOf = (call: { readonly init: RequestInit }): Record<string, unknown> => JSON.parse(String(call.init.body));

const mediaOf = (el: HTMLDivElement): HTMLMediaElement => el.querySelector('audio, video')!;
const statusOf = (el: HTMLDivElement): string | null => mediaOf(el).getAttribute('data-status');
const progressOf = (el: HTMLDivElement): number => Number(mediaOf(el).getAttribute('data-progress'));

/** Remplace `play`/`pause`/`load` par des bouchons qui dispatchent l'événement natif correspondant. */
function stubMedia(el: HTMLMediaElement): { playCalls: number; pauseCalls: number; loadCalls: number } {
  const calls = { playCalls: 0, pauseCalls: 0, loadCalls: 0 };
  el.play = () => {
    calls.playCalls += 1;
    el.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  el.pause = () => {
    calls.pauseCalls += 1;
    el.dispatchEvent(new Event('pause'));
  };
  el.load = () => {
    calls.loadCalls += 1;
    el.dispatchEvent(new Event('emptied'));
  };
  return calls;
}

describe('useMediaPlayback — permission et bascule (#5805)', () => {
  test('toggle() sur idle : play(), claim le coordinateur, status playing après l’événement play', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const calls = stubMedia(mediaOf(el));

    expect(statusOf(el)).toBe('idle');

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });

    expect(calls.playCalls).toBe(1);
    expect(coordinator.active()).toBe('a');
    expect(statusOf(el)).toBe('playing');
  });

  test('toggle() sur playing : pause(), status paused, coordinateur relâché', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const calls = stubMedia(mediaOf(el));

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    expect(statusOf(el)).toBe('playing');

    await act(async () => {
      playback.toggle();
    });

    expect(calls.pauseCalls).toBe(1);
    expect(statusOf(el)).toBe('paused');
    expect(coordinator.active()).toBeNull();
  });
});

describe('useMediaPlayback — un seul média à la fois (#5805)', () => {
  test('un claim d’un AUTRE id met CET élément en pause — le rappel remis au coordinateur est bien pause() de cet élément', async () => {
    const coordinator = createMediaCoordinator();
    let playbackA!: MediaPlayback;
    let playbackB!: MediaPlayback;

    const elA = mount({ onReady: (p) => (playbackA = p), attachmentId: 'a', coordinator });
    const callsA = stubMedia(mediaOf(elA));
    await act(async () => {
      playbackA.toggle();
      await Promise.resolve();
    });
    expect(statusOf(elA)).toBe('playing');

    // Un SECOND montage, MÊME coordinateur — deux widgets d'un même fil.
    const elB = mount({ onReady: (p) => (playbackB = p), attachmentId: 'b', coordinator });
    stubMedia(mediaOf(elB));
    await act(async () => {
      playbackB.toggle();
      await Promise.resolve();
    });

    expect(coordinator.active()).toBe('b');
    expect(callsA.pauseCalls).toBe(1);
    expect(statusOf(elA)).toBe('paused');
    expect(statusOf(elB)).toBe('playing');
  });

  /**
   * T9 (#6221) — LE COORDINATEUR NE DISTINGUE PAS LES ÉLÉMENTS : un `<video>`
   * qui réclame l'exclusivité fait `pause()` sur l'`<audio>` actif, exactement
   * comme un second `<audio>` l'aurait fait. C'est la preuve, avec de VRAIS
   * éléments DOM, que `HTMLMediaElement` est le bon type commun — le témoin
   * pur équivalent vit dans `media-coordinator.test.ts`.
   */
  test('une vidéo qui réclame l’exclusivité met en pause un vocal actif — le coordinateur ne distingue pas les éléments', async () => {
    const coordinator = createMediaCoordinator();
    let voice!: MediaPlayback;
    let video!: MediaPlayback;

    const voiceEl = mount({ onReady: (p) => (voice = p), attachmentId: 'voice-1', coordinator, tag: 'audio' });
    const voiceCalls = stubMedia(mediaOf(voiceEl));
    await act(async () => {
      voice.toggle();
      await Promise.resolve();
    });
    expect(statusOf(voiceEl)).toBe('playing');

    const videoEl = mount({ onReady: (p) => (video = p), attachmentId: 'video-1', coordinator, tag: 'video' });
    stubMedia(mediaOf(videoEl));
    await act(async () => {
      video.toggle();
      await Promise.resolve();
    });

    expect(coordinator.active()).toBe('video-1');
    expect(voiceCalls.pauseCalls).toBe(1);
    expect(statusOf(voiceEl)).toBe('paused');
    expect(statusOf(videoEl)).toBe('playing');
  });
});

describe('useMediaPlayback — progression et fin (#5805)', () => {
  test('timeupdate (currentTime 3, duration 12) ⇒ progress 0.25 ; ended ⇒ idle, progress 1, coordinateur relâché', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const media = mediaOf(el);
    stubMedia(media);
    Object.defineProperty(media, 'duration', { value: 12, configurable: true });

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });

    await act(async () => {
      Object.defineProperty(media, 'currentTime', { value: 3, configurable: true });
      media.dispatchEvent(new Event('timeupdate'));
    });
    expect(progressOf(el)).toBe(0.25);

    await act(async () => {
      media.dispatchEvent(new Event('ended'));
    });
    expect(statusOf(el)).toBe('idle');
    expect(progressOf(el)).toBe(1);
    expect(coordinator.active()).toBeNull();
  });
});

describe('useMediaPlayback — échec de lecture (#5805)', () => {
  test('error ⇒ status error ; toggle() réessaie (load() puis play())', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const media = mediaOf(el);
    const calls = stubMedia(media);

    await act(async () => {
      media.dispatchEvent(new Event('error'));
    });
    expect(statusOf(el)).toBe('error');

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });

    expect(calls.loadCalls).toBe(1);
    expect(calls.playCalls).toBe(1);
    expect(statusOf(el)).toBe('playing');
  });
});

/**
 * LA MÉCANIQUE DE LA BARRE DE LECTURE (#6359) — position, durée, saut, muet,
 * vitesse, image dans l'image. `tracksTime` est OPT-IN : seule la visionneuse
 * affiche un temps à la seconde ; une tuile du fil qui le suivrait se
 * re-rendrait chaque seconde pour rien (« Zero Unnecessary Re-render »).
 */
const attr = (el: HTMLDivElement, name: string): string | null => mediaOf(el).getAttribute(name);

function setMediaTime(media: HTMLMediaElement, values: { readonly currentTime?: number; readonly duration?: number }): void {
  if (values.duration !== undefined) Object.defineProperty(media, 'duration', { value: values.duration, configurable: true });
  if (values.currentTime !== undefined) Object.defineProperty(media, 'currentTime', { value: values.currentTime, configurable: true, writable: true });
}

describe('useMediaPlayback — temps suivi à la seconde, sur demande (#6359)', () => {
  test('loadedmetadata ⇒ la durée de l’élément, en secondes', async () => {
    const coordinator = createMediaCoordinator();
    const el = mount({ onReady: () => {}, attachmentId: 'v', coordinator, tag: 'video', tracksTime: true });
    const media = mediaOf(el);

    await act(async () => {
      setMediaTime(media, { duration: 65 });
      media.dispatchEvent(new Event('loadedmetadata'));
    });

    expect(attr(el, 'data-duration')).toBe('65');
  });

  test('timeupdate ⇒ la position à la seconde ; deux instants de la même seconde ne re-rendent pas', async () => {
    const coordinator = createMediaCoordinator();
    let renders = 0;
    const el = mount({ onReady: () => (renders += 1), attachmentId: 'v', coordinator, tag: 'video', tracksTime: true });
    const media = mediaOf(el);
    setMediaTime(media, { duration: 65 });

    await act(async () => {
      setMediaTime(media, { currentTime: 12.4 });
      media.dispatchEvent(new Event('timeupdate'));
    });
    expect(attr(el, 'data-position')).toBe('12');
    const rendersAt12 = renders;

    await act(async () => {
      setMediaTime(media, { currentTime: 12.6 });
      media.dispatchEvent(new Event('timeupdate'));
    });
    expect(attr(el, 'data-position')).toBe('12');
    expect(renders).toBe(rendersAt12);
  });

  test('sans tracksTime, la position ne suit pas — la tuile du fil ne paie rien', async () => {
    const coordinator = createMediaCoordinator();
    const el = mount({ onReady: () => {}, attachmentId: 'v', coordinator, tag: 'video' });
    const media = mediaOf(el);

    await act(async () => {
      setMediaTime(media, { duration: 65, currentTime: 30 });
      media.dispatchEvent(new Event('loadedmetadata'));
      media.dispatchEvent(new Event('timeupdate'));
    });

    expect(attr(el, 'data-position')).toBe('0');
    expect(attr(el, 'data-duration')).toBe('0');
  });
});

describe('useMediaPlayback — saut, muet, vitesse (#6359)', () => {
  test('seek(30) déplace RÉELLEMENT la lecture et la position suit sans attendre le navigateur', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'v', coordinator, tag: 'video', tracksTime: true });
    const media = mediaOf(el);
    setMediaTime(media, { duration: 65, currentTime: 0 });

    await act(async () => {
      playback.seek(30);
    });

    expect(media.currentTime).toBe(30);
    expect(attr(el, 'data-position')).toBe('30');
  });

  test('seek est borné à la durée : ni avant 0, ni après la fin', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'v', coordinator, tag: 'video', tracksTime: true });
    const media = mediaOf(el);
    setMediaTime(media, { duration: 65, currentTime: 10 });

    await act(async () => {
      playback.seek(90);
    });
    expect(media.currentTime).toBe(65);

    await act(async () => {
      playback.seek(-5);
    });
    expect(media.currentTime).toBe(0);
  });

  test('setMuted(true) coupe l’élément ; un changement externe (volumechange) est relu', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'v', coordinator, tag: 'video', tracksTime: true });
    const media = mediaOf(el);

    await act(async () => {
      playback.setMuted(true);
    });
    expect(media.muted).toBe(true);
    expect(attr(el, 'data-muted')).toBe('true');

    await act(async () => {
      media.muted = false;
      media.dispatchEvent(new Event('volumechange'));
    });
    expect(attr(el, 'data-muted')).toBe('false');
  });

  test('setRate(1.5) règle la vitesse de l’élément', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'v', coordinator, tag: 'video', tracksTime: true });
    const media = mediaOf(el);

    await act(async () => {
      playback.setRate(1.5);
    });

    expect(media.playbackRate).toBe(1.5);
    expect(attr(el, 'data-rate')).toBe('1.5');
  });
});

describe('useMediaPlayback — image dans l’image (#6359)', () => {
  const pipDocument = () => document as Document & { pictureInPictureEnabled?: boolean; exitPictureInPicture?: () => Promise<void> };

  test('un <audio> n’a pas d’image dans l’image', () => {
    Object.defineProperty(pipDocument(), 'pictureInPictureEnabled', { value: true, configurable: true });
    const coordinator = createMediaCoordinator();
    const el = mount({ onReady: () => {}, attachmentId: 'a', coordinator, tag: 'audio', tracksTime: true });
    expect(attr(el, 'data-pip')).toBe('unsupported');
  });

  test('sur une <video>, entrer puis sortir passe par le navigateur, et l’état suit ses événements', async () => {
    Object.defineProperty(pipDocument(), 'pictureInPictureEnabled', { value: true, configurable: true });
    let exitCalls = 0;
    pipDocument().exitPictureInPicture = () => {
      exitCalls += 1;
      return Promise.resolve();
    };
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    let requestCalls = 0;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'v', coordinator, tag: 'video', tracksTime: true });
    const video = mediaOf(el) as HTMLVideoElement;
    video.requestPictureInPicture = () => {
      requestCalls += 1;
      return Promise.resolve({} as PictureInPictureWindow);
    };

    await act(async () => {
      video.dispatchEvent(new Event('loadedmetadata'));
    });
    expect(attr(el, 'data-pip')).toBe('inactive');

    await act(async () => {
      playback.togglePictureInPicture();
      video.dispatchEvent(new Event('enterpictureinpicture'));
    });
    expect(requestCalls).toBe(1);
    expect(attr(el, 'data-pip')).toBe('active');

    await act(async () => {
      playback.togglePictureInPicture();
      video.dispatchEvent(new Event('leavepictureinpicture'));
    });
    expect(exitCalls).toBe(1);
    expect(attr(el, 'data-pip')).toBe('inactive');
  });

  test('un navigateur sans image dans l’image (pictureInPictureEnabled faux) ne l’offre pas', async () => {
    Object.defineProperty(pipDocument(), 'pictureInPictureEnabled', { value: false, configurable: true });
    const coordinator = createMediaCoordinator();
    const el = mount({ onReady: () => {}, attachmentId: 'v', coordinator, tag: 'video', tracksTime: true });
    await act(async () => {
      mediaOf(el).dispatchEvent(new Event('loadedmetadata'));
    });
    expect(attr(el, 'data-pip')).toBe('unsupported');
  });
});

describe('useMediaPlayback — démontage (#5805)', () => {
  test('démontage : le coordinateur est relâché et l’élément mis en pause — aucun son orphelin', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    const calls = stubMedia(mediaOf(el));

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    expect(coordinator.active()).toBe('a');

    act(() => {
      root.unmount();
    });

    expect(coordinator.active()).toBeNull();
    expect(calls.pauseCalls).toBe(1);
  });
});

/**
 * LA REPRISE ET LE RAPPORT DE CONSOMMATION (#7225, W6) — `report` est
 * OPT-IN, même patron que `tracksTime` : un widget qui n'en a pas besoin
 * (une tuile qui ne joue rien) ne paie rien.
 */
describe('useMediaPlayback — reprise au montage (#7225)', () => {
  test('resume non complet : element.currentTime est posé', async () => {
    const coordinator = createMediaCoordinator();
    const { deps } = fakeReportDeps();
    const el = mount({
      onReady: () => {},
      attachmentId: 'a',
      coordinator,
      report: { kind: 'listened', resume: { positionMs: 4_000, complete: false }, deps },
    });
    const media = mediaOf(el);

    expect(media.currentTime).toBe(4);
  });

  test('resume complet : aucun seek (le média repart de zéro)', async () => {
    const coordinator = createMediaCoordinator();
    const { deps } = fakeReportDeps();
    const el = mount({
      onReady: () => {},
      attachmentId: 'a',
      coordinator,
      report: { kind: 'listened', resume: { positionMs: 9_000, complete: true }, deps },
    });
    const media = mediaOf(el);

    expect(media.currentTime).toBe(0);
  });

  test('aucun resume connu : aucun seek', async () => {
    const coordinator = createMediaCoordinator();
    const { deps } = fakeReportDeps();
    const el = mount({
      onReady: () => {},
      attachmentId: 'a',
      coordinator,
      report: { kind: 'listened', deps },
    });
    expect(mediaOf(el).currentTime).toBe(0);
  });
});

describe('useMediaPlayback — rapport au serveur, throttlé (#7225)', () => {
  test('pause après lecture : un rapport « listened », position/durée/segment cohérents', async () => {
    const coordinator = createMediaCoordinator();
    const { deps, calls } = fakeReportDeps();
    let playback!: MediaPlayback;
    const el = mount({
      onReady: (p) => (playback = p),
      attachmentId: 'att-9',
      coordinator,
      report: { kind: 'listened', durationMs: 12_000, deps },
    });
    const media = mediaOf(el);
    stubMedia(media);
    setMediaTime(media, { duration: 12 });

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    setMediaTime(media, { currentTime: 4 });

    await act(async () => {
      playback.toggle(); // pause
      await Promise.resolve();
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/v1/attachments/att-9/status');
    const body = bodyOf(calls[0]!);
    expect(body.action).toBe('listened');
    expect(body.complete).toBe(false);
    expect(body.durationMs).toBe(12_000);
    expect(body.stretches).toEqual([{ startMs: 0, endMs: 4_000, endedBy: 'pause' }]);
  });

  test('deux pause en moins de 5 s : un seul appel réseau', async () => {
    const coordinator = createMediaCoordinator();
    const { deps, calls } = fakeReportDeps();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'att-9', coordinator, report: { kind: 'listened', deps } });
    const media = mediaOf(el);
    stubMedia(media);
    setMediaTime(media, { duration: 12 });

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    setMediaTime(media, { currentTime: 1 });
    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    expect(calls).toHaveLength(1);

    await act(async () => {
      playback.toggle(); // reprend
      await Promise.resolve();
    });
    setMediaTime(media, { currentTime: 2 });
    await act(async () => {
      playback.toggle(); // pause, < 5s après le premier rapport
      await Promise.resolve();
    });

    expect(calls).toHaveLength(1);
  });

  test('sans configuration `report` : aucun appel, même après pause', async () => {
    const coordinator = createMediaCoordinator();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'a', coordinator });
    stubMedia(mediaOf(el));

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    await act(async () => {
      playback.toggle();
    });

    // Rien à vérifier sur le réseau (aucun `deps` fourni) — ce témoin garde
    // seulement que le hook ne CASSE pas sans `report`.
    expect(statusOf(el)).toBe('paused');
  });

  test('fin de lecture (ended) : rapport FORCÉ avec complete:true, même moins de 5 s après un rapport précédent', async () => {
    const coordinator = createMediaCoordinator();
    const { deps, calls } = fakeReportDeps();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'att-9', coordinator, report: { kind: 'listened', deps } });
    const media = mediaOf(el);
    stubMedia(media);
    setMediaTime(media, { duration: 12 });

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    setMediaTime(media, { currentTime: 3 });
    await act(async () => {
      playback.toggle(); // pause ⇒ premier rapport
      await Promise.resolve();
    });
    expect(calls).toHaveLength(1);

    await act(async () => {
      playback.toggle(); // reprend
      await Promise.resolve();
    });
    setMediaTime(media, { currentTime: 12 });
    await act(async () => {
      media.dispatchEvent(new Event('ended'));
    });

    expect(calls).toHaveLength(2);
    const body = bodyOf(calls[1]!);
    expect(body.complete).toBe(true);
  });

  test('démontage après lecture : rapport FORCÉ (segment « dismissed »)', async () => {
    const coordinator = createMediaCoordinator();
    const { deps, calls } = fakeReportDeps();
    let playback!: MediaPlayback;
    const el = mount({ onReady: (p) => (playback = p), attachmentId: 'att-9', coordinator, report: { kind: 'listened', deps } });
    const media = mediaOf(el);
    stubMedia(media);
    setMediaTime(media, { duration: 12 });

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    setMediaTime(media, { currentTime: 2 });

    act(() => {
      root.unmount();
    });

    expect(calls).toHaveLength(1);
    const body = bodyOf(calls[0]!);
    expect(body.stretches).toEqual([{ startMs: 0, endMs: 2_000, endedBy: 'dismissed' }]);
    expect(body.complete).toBe(false);
  });

  test('démontage SANS avoir joué : aucun appel (rien à rapporter)', async () => {
    const coordinator = createMediaCoordinator();
    const { deps, calls } = fakeReportDeps();
    const el = mount({ onReady: () => {}, attachmentId: 'att-9', coordinator, report: { kind: 'listened', deps } });
    stubMedia(mediaOf(el));

    act(() => {
      root.unmount();
    });

    expect(calls).toHaveLength(0);
  });

  test('reportedFraction/reportedComplete progressent après un rapport (barre au repos, optimiste)', async () => {
    const coordinator = createMediaCoordinator();
    const { deps } = fakeReportDeps();
    let playback!: MediaPlayback;
    const el = mount({
      onReady: (p) => (playback = p),
      attachmentId: 'att-9',
      coordinator,
      report: { kind: 'listened', durationMs: 10_000, deps },
    });
    const media = mediaOf(el);
    stubMedia(media);
    setMediaTime(media, { duration: 10 });

    expect(attr(el, 'data-reported-fraction')).toBe('0');

    await act(async () => {
      playback.toggle();
      await Promise.resolve();
    });
    setMediaTime(media, { currentTime: 5 });
    await act(async () => {
      playback.toggle(); // pause
      await Promise.resolve();
    });

    expect(Number(attr(el, 'data-reported-fraction'))).toBeCloseTo(0.5, 5);
    expect(attr(el, 'data-reported-complete')).toBe('false');
  });
});
