import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SceneClockHandle } from '@/components/scene-clock';
import type { ProtectedMediaDeps } from '@/lib/api/protected-media';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';
import type { SceneFootprintParams } from '@/lib/stories/footprint';
import type { ReaderCardFraming } from '@/lib/stories/framing';
import type { Footprint } from '@/lib/stories/image-only';

import { StorySceneLayer, type StorySceneLayerProps } from './story-scene-layer';

/**
 * T9 (#6899) — `StorySceneLayer`, l'hôte des scènes v3 du lecteur. Tout se
 * mesure dans les bornes INTRINSÈQUES de la scène (1080×1920 ici, échelle 1) :
 * le verdict, les bandes, le placeholder. Le mesureur est INJECTÉ (`measure`) —
 * sous happy-dom aucune mise en page réelle n'existe, et la loi d'image seule
 * s'éprouve comme sa jumelle Swift, par un dictionnaire.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await import('@/components/scene-player');
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

async function mount(node: ReactElement): Promise<HTMLDivElement> {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return container;
}

/** Le moteur est chargé À LA DEMANDE (`lazy`) : sous la suite ENTIÈRE, sa
 * résolution peut dépasser un tour d'attente — on attend l'élément, borné,
 * plutôt qu'une durée devinée. */
async function waitForElement(root: ParentNode, selector: string): Promise<Element> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const found = root.querySelector(selector);
    if (found !== null) return found;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`élément jamais monté : ${selector}`);
}

function documentOf(objects: readonly unknown[], extra?: Record<string, unknown>): CanvasDocument {
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects, ...extra }] });
  if (doc === null) throw new Error('vecteur invalide');
  return doc;
}

const FRAMING: ReaderCardFraming = { canvas: { x: 0, y: 0, width: 1080, height: 1920 }, scale: 1, offsetY: 0, cornerRadius: 22 };
const STORY: StorySceneLayerProps['story'] = {
  id: 'st-1',
  media: [
    { id: 'pano', fileUrl: 'data:image/png;base64,PANO', width: 1920, height: 1080 },
    { id: 'track', fileUrl: 'data:audio/mp4;base64,TRACK', mimeType: 'audio/mp4' },
  ],
};

const fitBackground = { id: 'bg', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'pano', thumbHash: '3nQFFAT4WIiod4WYZ6joeo+u9w==', transform: { videoFitMode: 'fit' } } };
const text = (y: number, payload: Record<string, unknown> = { text: 'Bonjour' }, locale?: string) => ({
  id: 't',
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y },
  plane: 'fg',
  z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  ...(locale !== undefined ? { locale } : {}),
  payload,
});

/** Un texte « mesuré » à sa pose : 400 × 120 autour de son ancre. */
const measureAtAnchor = ({ object, canvasSize }: SceneFootprintParams): Footprint | null =>
  object.kind !== 'text' || object.anchor.t !== 'free'
    ? null
    : { position: { x: object.anchor.x * canvasSize.width, y: object.anchor.y * canvasSize.height }, size: { width: 400, height: 120 } };

function layer(overrides: Partial<StorySceneLayerProps> & Pick<StorySceneLayerProps, 'document'>): ReactElement {
  return (
    <StorySceneLayer
      story={STORY}
      sceneIndex={0}
      preferredLanguages={['fr']}
      framing={FRAMING}
      playing={false}
      muted={false}
      onReady={() => {}}
      onDurationKnown={() => {}}
      onPlaybackBlocked={() => {}}
      onSoundAvailability={() => {}}
      measure={measureAtAnchor}
      {...overrides}
    />
  );
}

describe('StorySceneLayer — verdict `canvas`', () => {
  test('un texte posé sur la BANDE basse ⇒ la carte entière : moteur monté, bandes habillées, aucune image seule', async () => {
    const el = await mount(layer({ document: documentOf([fitBackground, text(0.92)]) }));
    await waitForElement(el, '[data-scene-player]');
    const box = el.querySelector('[data-story-scene-box]');
    expect(box?.getAttribute('data-story-verdict')).toBe('canvas');
    expect(box?.querySelector('[data-scene-player]')).not.toBeNull();
    expect(box?.querySelector('[data-scene-letterbox]')).not.toBeNull();
    expect(el.querySelector('[data-story-image-only]')).toBeNull();
  });

  test('un fond qui REMPLIT ne peint aucune bande', async () => {
    const filled = { ...fitBackground, payload: { postMediaId: 'pano', thumbHash: '3nQFFAT4WIiod4WYZ6joeo+u9w==' } };
    const el = await mount(layer({ document: documentOf([filled, text(0.92)]) }));
    expect(el.querySelector('[data-scene-letterbox]')).toBeNull();
  });
});

describe('StorySceneLayer — verdict `imageOnly`', () => {
  test('une story qui n’est QU’UNE image ⇒ l’image seule à son rectangle, AUCUN moteur ni bande', async () => {
    const el = await mount(layer({ document: documentOf([fitBackground]) }));
    const image = el.querySelector('[data-story-image-only]') as HTMLImageElement | null;
    expect(el.querySelector('[data-story-scene-box]')?.getAttribute('data-story-verdict')).toBe('imageOnly');
    expect(image?.getAttribute('src')).toBe('data:image/png;base64,PANO');
    expect(image?.style.top).toBe('656.25px');
    expect(image?.style.height).toBe('607.5px');
    expect(el.querySelector('[data-scene-player]')).toBeNull();
    expect(el.querySelector('[data-scene-letterbox]')).toBeNull();
  });

  /* LE DÉFAUT DE LA PREMIÈRE FORME : l'image seule ne montait QUE l'image, et
     le texte que l'auteur avait posé DANS l'image disparaissait. iOS garde le
     canvas à sa taille et ne rogne que la carte (`+ImageOnly.swift:13-21`). */
  test('un texte DANS l’image ⇒ le moteur reste monté, rogné au rectangle, et le texte se lit', async () => {
    const el = await mount(layer({ document: documentOf([fitBackground, text(0.5)]) }));
    await waitForElement(el, '[data-scene-text]');
    const clip = el.querySelector('[data-story-image-only-clip]') as HTMLElement | null;
    expect(el.querySelector('[data-story-scene-box]')?.getAttribute('data-story-verdict')).toBe('imageOnly');
    expect(clip?.style.clipPath).toBe('inset(656.25px 0px 656.25px 0px round 22px)');
    expect(clip?.querySelector('[data-scene-text]')?.textContent).toBe('Bonjour');
    expect(el.querySelector('[data-scene-letterbox]')).toBeNull();
  });

  test('le texte servi est celui du Prisme au RANG 2, avec sa langue', async () => {
    const document = documentOf([fitBackground, text(0.5, { text: 'Hola', translations: { fr: 'Bonjour' } }, 'es')]);
    const el = await mount(layer({ document, preferredLanguages: ['de', 'fr'] }));
    const served = await waitForElement(el, '[data-scene-text]');
    expect(served?.textContent).toBe('Bonjour');
    expect(served?.getAttribute('lang')).toBe('fr');
  });
});

describe('StorySceneLayer — l’attente du contenu', () => {
  test('le fond flou plein écran est peint SOUS la carte, depuis l’empreinte du fond', async () => {
    const el = await mount(layer({ document: documentOf([fitBackground, text(0.92)]) }));
    const layerRoot = el.querySelector('[data-story-scene-layer]');
    const backdrop = layerRoot?.querySelector('[data-story-backdrop]') as HTMLElement | null;
    expect(backdrop?.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
    expect(backdrop?.style.filter).toBe('blur(60px)');
    expect(layerRoot?.firstElementChild).toBe(backdrop);
  });

  test('le placeholder couvre la carte tant que le contenu n’est pas prêt', async () => {
    const el = await mount(layer({ document: documentOf([{ ...fitBackground, payload: { postMediaId: 'pano', mediaType: 'video/mp4', transform: { videoFitMode: 'fit' } } }, text(0.92)]) }));
    const box = el.querySelector('[data-story-scene-box]');
    const placeholder = box?.querySelector('[data-story-placeholder]') as HTMLElement | null;
    expect(placeholder).not.toBeNull();
    expect(placeholder?.style.opacity).toBe('1');
    expect(box?.hasAttribute('data-story-ready')).toBe(false);
  });

  test('un fond COULEUR est prêt au montage : `onReady` UNE fois, placeholder effacé', async () => {
    let ready = 0;
    const colour = { id: 'bg', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { background: '4338CA' } };
    const el = await mount(layer({ document: documentOf([colour, text(0.5)]), onReady: () => (ready += 1) }));
    await waitForElement(el, '[data-story-ready]');
    const box = el.querySelector('[data-story-scene-box]');
    expect(ready).toBe(1);
    expect(box?.hasAttribute('data-story-ready')).toBe(true);
    expect((box?.querySelector('[data-story-placeholder]') as HTMLElement | null)?.style.opacity).toBe('0');
  });
});

describe('StorySceneLayer — le son de fond', () => {
  const withTrack = (fond: unknown = fitBackground) =>
    documentOf([
      fond,
      text(0.92),
      { id: 'a', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { isBackground: true, postMediaId: 'track', volume: 0.4 } },
    ]);
  const videoBackground = { ...fitBackground, payload: { postMediaId: 'pano', mediaType: 'video/mp4', transform: { videoFitMode: 'fit' } } };

  test('le muet viewer gouverne la piste, et son `volume` est posé', async () => {
    const el = await mount(layer({ document: withTrack(), muted: true }));
    const audio = el.querySelector('[data-scene-sound-track]') as HTMLAudioElement | null;
    expect(audio?.getAttribute('src')).toBe('data:audio/mp4;base64,TRACK');
    expect(audio?.muted).toBe(true);
    expect(audio?.volume).toBeCloseTo(0.4, 5);
  });

  /* `pendingBackgroundActivation` (`StoryCanvasUIView.swift:477-487`) : ni la
     vidéo ni le son de fond ne partent avant que TOUT le contenu soit prêt.
     Un fond VIDÉO attend `loadeddata`, que happy-dom n'émet jamais seul.
     On compte les DEMANDES de lecture de la piste, jamais `paused` : un autre
     fichier de la suite remplace `HTMLMediaElement.prototype.play`, et l'état
     que happy-dom en déduit n'est plus le sien. */
  async function countTrackPlays(run: (plays: () => number) => Promise<void>): Promise<number> {
    const prototype = window.HTMLMediaElement.prototype;
    const original = prototype.play;
    let count = 0;
    prototype.play = function play(this: HTMLMediaElement) {
      if (this.hasAttribute('data-scene-sound-track')) count += 1;
      return Promise.resolve();
    };
    try {
      await run(() => count);
    } finally {
      prototype.play = original;
    }
    return count;
  }

  test('lecture demandée, contenu PAS prêt ⇒ la piste ne part pas ; prêt ⇒ elle part', async () => {
    let beforeReady = -1;
    const total = await countTrackPlays(async (plays) => {
      const el = await mount(layer({ document: withTrack(videoBackground), playing: true }));
      const video = await waitForElement(el, 'video');
      expect(el.querySelector('[data-story-scene-box]')?.hasAttribute('data-story-ready')).toBe(false);
      beforeReady = plays();
      await act(async () => {
        video.dispatchEvent(new window.Event('loadeddata'));
      });
    });
    expect(beforeReady).toBe(0);
    expect(total).toBe(1);
  });

  test('en PAUSE, même prêt, la piste ne part pas', async () => {
    const plays = await countTrackPlays(async () => {
      await mount(layer({ document: withTrack(), playing: false }));
    });
    expect(plays).toBe(0);
  });

  test('le chrome apprend s’il a un son à COUPER : vrai avec la piste, faux sans', async () => {
    const heard: boolean[] = [];
    await mount(layer({ document: withTrack(), onSoundAvailability: (available) => heard.push(available) }));
    act(() => {
      root.unmount();
    });
    container.remove();
    await mount(layer({ document: documentOf([fitBackground, text(0.92)]), onSoundAvailability: (available) => heard.push(available) }));
    expect(heard).toEqual([true, false]);
  });

  test('sans piste de fond, aucun `<audio>` ne se monte', async () => {
    const el = await mount(layer({ document: documentOf([fitBackground, text(0.92)]) }));
    expect(el.querySelector('audio')).toBeNull();
  });

  /**
   * # LE BOUTON MUET D'UNE PISTE QUE PERSONNE N'ENTENDRA (#7015, seconde revue)
   *
   * `sceneHasControllableSound` est STRUCTUREL : il dit ce que le DOCUMENT
   * déclare, jamais ce que le transport a rendu. Une piste empruntée servie
   * par la route authentifiée peut être définitivement refusée (401) — le lot
   * le SAIT (`soundUnavailable`, peint en `data-scene-sound-unavailable`) —
   * mais l'availability remontée au chrome restait `true`. Le lecteur montait
   * donc son `SoundToggle` (`story.tsx` § `showsSound`) au-dessus d'une scène
   * SANS `<audio>` : on tape, `aria-pressed` bascule, et il ne se passe
   * JAMAIS rien. **Un contrôle existe s'il a un EFFET** (loi 4) — et le
   * studio, lui, applique déjà la règle (« ni lecteur ni bouton »,
   * `story-compose.test.tsx`). La règle était appliquée à UNE des deux
   * surfaces qui élisent la même piste.
   *
   * Le second témoin est le garde-fou de ce correctif : la vidéo de fond NON
   * COUPÉE sonne toute seule. Retirer le bouton parce que la PISTE est
   * refusée retirerait un contrôle qui a, lui, un effet — une garde
   * fail-closed sur le mauvais axe est un défaut de plus, pas un de moins.
   */
  const SON_PROTEGE = '/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a';
  /** LA MÊME story, dont la seule piste est servie par la route AUTHENTIFIÉE. */
  const STORY_PROTEGEE: StorySceneLayerProps['story'] = {
    ...STORY,
    media: (STORY.media ?? []).map((m) => (m.id === 'track' ? { ...m, fileUrl: SON_PROTEGE } : m)),
  };
  /** La passerelle REFUSE — le 401 mesuré en production sur une balise nue. */
  const depsRefus = (): ProtectedMediaDeps => ({
    credential: () => ({ kind: 'registered', token: 'jeton-de-test' }),
    fetchImpl: async () => new Response('', { status: 401 }),
    createObjectURL: () => 'blob:meeshy/jamais',
    revokeObjectURL: () => {},
  });

  test('une piste PROTÉGÉE refusée ⇒ le chrome apprend qu’il n’a AUCUN son à couper (jamais un bouton inerte)', async () => {
    const heard: boolean[] = [];
    const el = await mount(
      layer({
        story: STORY_PROTEGEE,
        document: withTrack(),
        mediaDeps: depsRefus(),
        onSoundAvailability: (available) => heard.push(available),
      }),
    );
    await waitForElement(el, '[data-scene-sound-unavailable]');
    expect(el.querySelector('[data-scene-sound-track]')).toBeNull();
    expect(heard.at(-1)).toBe(false);
  });

  test('CONTRASTE — piste refusée MAIS fond vidéo non coupé ⇒ le bouton RESTE : ce son-là joue', async () => {
    const heard: boolean[] = [];
    const el = await mount(
      layer({
        story: STORY_PROTEGEE,
        document: withTrack(videoBackground),
        mediaDeps: depsRefus(),
        onSoundAvailability: (available) => heard.push(available),
      }),
    );
    await waitForElement(el, '[data-scene-sound-unavailable]');
    expect(heard.at(-1)).toBe(true);
  });
});

describe('StorySceneLayer — le parcours au doigt (#7879)', () => {
  test('l’hôte reçoit l’horloge du moteur, et un seek recale AUSSI la piste de fond', async () => {
    let clock: SceneClockHandle | null = null;
    const el = await mount(
      layer({
        document: documentOf([
          fitBackground,
          text(0.92),
          { id: 'a', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { isBackground: true, postMediaId: 'track' } },
        ]),
        onClock: (c) => (clock = c),
      }),
    );
    await waitForElement(el, '[data-scene-player]');
    const audio = el.querySelector('[data-scene-sound-track]') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { value: 20, configurable: true });
    if (clock === null) throw new Error('horloge jamais remise');
    const held: SceneClockHandle = clock;
    act(() => held.seek(4));
    expect(audio.currentTime).toBeCloseTo(4, 5);
  });
});

describe('StorySceneLayer — la durée de la diapositive fait MENER l’horloge (#7879, retour porteur)', () => {
  test('sans objet temporisé, la durée remise par le lecteur fait suivre la timeline à ses médias', async () => {
    let clock: SceneClockHandle | null = null;
    const el = await mount(layer({ document: documentOf([fitBackground, text(0.92)]), durationSeconds: 6, onClock: (c) => (clock = c) }));
    await waitForElement(el, '[data-scene-player]');
    if (clock === null) throw new Error('horloge jamais remise');
    const held: SceneClockHandle = clock;
    expect(held.isDriving()).toBe(true);
  });
});
