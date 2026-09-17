import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { MEDIA_IMAGE_DATA_URI } from '@/lib/api/fixtures-media';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import ScenePlayer from './scene-player';

/**
 * LE CONTRAT QU'UN HÔTE QUI ATTEND SA SCÈNE PASSE AU MOTEUR (#6899) — miroir
 * de `MeeshyScenePlayer.init(isMuted:onContentReady:…)`
 * (`MeeshyScenePlayer.swift:76-99`). Le lecteur de story ne démarre sa
 * diapositive qu'au signal « contenu prêt » (`StoryCanvasUIView.onContentReady`) :
 * sans lui, une scène à fond image laissait la barre à 0 pour toujours
 * (mesuré au navigateur sur `/story/st-scene`, 4 s, `aria-valuenow="0"`).
 *
 * Le fil ne passe AUCUNE de ces options : son comportement reste celui que
 * `check-feed-scenes.mjs` garde (muet de config, `preload="none"`).
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

function mount(node: ReactElement): HTMLDivElement {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

function documentOf(objects: readonly unknown[]): CanvasDocument {
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects }] });
  if (doc === null) throw new Error('vecteur invalide');
  return doc;
}

const fond = (payload: Record<string, unknown>) => ({
  id: 'bg',
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'bg',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload,
});

const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'img', src: 'photo.png' }, { id: 'vid', src: 'clip.mp4' }] };

describe('ScenePlayer — `onContentReady`, le signal qui démarre la diapositive', () => {
  test('un fond COULEUR est prêt dès le montage — rien ne reste à télécharger', () => {
    let ready = 0;
    mount(
      <ScenePlayer document={documentOf([fond({ background: '4338CA' })])} sceneIndex={0} mode="reader" playing={false} carrier={carrier} preferredLanguages={['fr']} onContentReady={() => (ready += 1)} />,
    );
    expect(ready).toBe(1);
  });

  /* Sous happy-dom, une `<img>` émet `error` DÈS son insertion (aucun réseau) :
     le « pas avant le chargement » d'une image ne s'observe donc qu'au
     navigateur (`check-story-scene.mjs`, placeholder peint AVANT le signal).
     Ici on prouve que le signal est BRANCHÉ sur les deux événements. */
  test('un fond IMAGE signale « prêt » à chacun de ses événements, `load` comme `error`', () => {
    let ready = 0;
    const el = mount(
      <ScenePlayer document={documentOf([fond({ postMediaId: 'img' })])} sceneIndex={0} mode="reader" playing={false} carrier={carrier} preferredLanguages={['fr']} onContentReady={() => (ready += 1)} />,
    );
    const image = el.querySelector('img');
    const before = ready;
    act(() => {
      image?.dispatchEvent(new window.Event('load'));
    });
    expect(ready).toBe(before + 1);
    act(() => {
      image?.dispatchEvent(new window.Event('error'));
    });
    expect(ready).toBe(before + 2);
  });

  test('un fond VIDÉO attendu se précharge (`preload="auto"`) et n’est prêt qu’à `loadeddata`', () => {
    let ready = 0;
    const el = mount(
      <ScenePlayer
        document={documentOf([fond({ postMediaId: 'vid', mediaType: 'video/mp4' })])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr']}
        onContentReady={() => (ready += 1)}
      />,
    );
    const video = el.querySelector('video');
    expect(video?.getAttribute('preload')).toBe('auto');
    expect(ready).toBe(0);
    act(() => {
      video?.dispatchEvent(new window.Event('loadeddata'));
    });
    expect(ready).toBe(1);
  });

  test('sans hôte qui attend (le fil), la vidéo reste `preload="none"`', () => {
    const el = mount(
      <ScenePlayer document={documentOf([fond({ postMediaId: 'vid', mediaType: 'video/mp4' })])} sceneIndex={0} mode="card" playing={false} carrier={carrier} preferredLanguages={['fr']} />,
    );
    expect(el.querySelector('video')?.getAttribute('preload')).toBe('none');
  });
});

describe('ScenePlayer — `muted`, la demande de l’hôte gouverne le muet du mode', () => {
  test('`mode="reader"` (sonore) + `muted` ⇒ la vidéo de fond est muette', () => {
    const el = mount(
      <ScenePlayer document={documentOf([fond({ postMediaId: 'vid', mediaType: 'video/mp4' })])} sceneIndex={0} mode="reader" playing={false} muted carrier={carrier} preferredLanguages={['fr']} />,
    );
    expect(el.querySelector('video')?.muted).toBe(true);
  });

  test('`mode="reader"` sans demande ⇒ le muet du mode (sonore)', () => {
    const el = mount(
      <ScenePlayer document={documentOf([fond({ postMediaId: 'vid', mediaType: 'video/mp4' })])} sceneIndex={0} mode="reader" playing={false} carrier={carrier} preferredLanguages={['fr']} />,
    );
    expect(el.querySelector('video')?.muted).toBe(false);
  });

  // T-E7 (#6901, D5) — le verrou du muet : `card` VERROUILLE le son quel que
  // soit ce que l'hôte demande (miroir `MeeshyScenePlayer.hostMute`).
  test('mode="card" + muted={false} ⇒ la vidéo de fond reste muette (le verrou de la carte)', () => {
    const el = mount(
      <ScenePlayer
        document={documentOf([fond({ postMediaId: 'vid', mediaType: 'video/mp4' })])}
        sceneIndex={0}
        mode="card"
        playing={false}
        muted={false}
        carrier={carrier}
        preferredLanguages={['fr']}
      />,
    );
    expect(el.querySelector('video')?.muted).toBe(true);
  });

  test('une entrée de porteur SANS adresse ne masque pas le `mediaURL` de l’objet', () => {
    const el = mount(
      <ScenePlayer
        document={documentOf([fond({ postMediaId: 'vide', mediaURL: 'data:image/png;base64,AAAA' })])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={{ postId: 'p1', media: [{ id: 'vide', src: '' }] }}
        preferredLanguages={['fr']}
      />,
    );
    expect(el.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });
});

/** Une scène complète, sans fond — pour exercer les couches d'objet SANS
 * dépendre de l'élection du fond (`SceneCanvas`, `backgroundMedia`). */
function sceneDocumentOf(objects: readonly unknown[], sceneOverrides?: Record<string, unknown>): CanvasDocument {
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects, ...sceneOverrides }] });
  if (doc === null) throw new Error('vecteur invalide');
  return doc;
}

const textObject = (overrides: Record<string, unknown>) => ({
  id: 'txt',
  kind: 'text',
  anchor: { t: 'free', x: 0.3, y: 0.7 },
  plane: 'fg',
  z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: { text: 'x' },
  ...overrides,
});

// T-E1 — le Prisme d'un texte de scène, au DOM.
describe('ScenePlayer — le Prisme d’un texte de scène, au DOM (T-E1)', () => {
  test("locale:'en', translations:{fr:'Bonjour'}, prisme ['fr','en'] ⇒ « Bonjour », lang=\"fr\"", () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([textObject({ locale: 'en', payload: { text: 'Hello', translations: { fr: 'Bonjour' } } })])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr', 'en']}
      />,
    );
    const text = el.querySelector('[data-scene-text]');
    expect(text?.textContent).toBe('Bonjour');
    expect(text?.getAttribute('lang')).toBe('fr');
  });

  // Leçon 261 — un témoin de RANG s'écrit sur un rang AUTRE que le premier :
  // langue d'origine 'es' hors prisme, traduction 'en' au rang 2 (le rang 1
  // 'fr' n'a pas de traduction) ⇒ 'Hello', jamais 'Hallo' (rang 3, de).
  test("locale:'es', translations:{en:'Hello', de:'Hallo'}, prisme ['fr','en'] ⇒ « Hello », lang=\"en\"", () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([textObject({ locale: 'es', payload: { text: 'Hola', translations: { en: 'Hello', de: 'Hallo' } } })])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr', 'en']}
      />,
    );
    const text = el.querySelector('[data-scene-text]');
    expect(text?.textContent).toBe('Hello');
    expect(text?.getAttribute('lang')).toBe('en');
  });
});

// T-E2 — les six couches existent et portent leur kind.
describe('ScenePlayer — les six couches existent et portent leur kind (T-E2)', () => {
  test('un objet de chaque kind visible est peint ; mention et kind inconnu sont absents, sans erreur', () => {
    const objects = [
      textObject({ id: 't1' }),
      { id: 'm1', kind: 'media', anchor: { t: 'free', x: 0.2, y: 0.2 }, plane: 'content', z: 2, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'img', aspectRatio: 1 } },
      { id: 's1', kind: 'sticker', anchor: { t: 'free', x: 0.8, y: 0.8 }, plane: 'fg', z: 3, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { emoji: '🔥' } },
      { id: 'p1', kind: 'place', anchor: { t: 'band', edge: 'bottom' }, plane: 'fg', z: 4, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { place: { name: 'Café Central' } } },
      { id: 'd1', kind: 'drawing', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 5, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { strokes: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], width: 6, tool: 'pen' }] } },
      { id: 'a1', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 6, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'clip', placement: 'overlay' } },
      { id: 'x1', kind: 'mention', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 7, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: {} },
      { id: 'u1', kind: 'unknown-future-kind', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 8, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: {} },
    ];
    const el = mount(
      <ScenePlayer document={sceneDocumentOf(objects)} sceneIndex={0} mode="reader" playing={false} carrier={{ postId: 'p1', media: [{ id: 'img', src: 'photo.png' }, { id: 'clip', src: 'clip.mp3' }] }} preferredLanguages={['fr']} />,
    );
    for (const kind of ['text', 'media', 'sticker', 'place', 'drawing', 'audio']) {
      expect(el.querySelector(`[data-scene-object="${kind}"]`)).not.toBeNull();
    }
    expect(el.querySelectorAll('[data-scene-object]').length).toBe(6);
  });
});

// T-E3 — un média posé a le rapport de sa charge, pas 60%.
//
// LIMITE D'ENVIRONNEMENT MESURÉE (à consigner) : happy-dom REJETTE toute
// valeur CSS en unité `cqw` à l'assignation (`el.style.width = '65cqw'` ⇒
// `el.style.width === ''`, aucun attribut `style` n'apparaît même à la
// sérialisation) — confirmé par une sonde isolée (`el.style.cssText`,
// `setAttribute('style', …)` direct : la chaîne SURVIT à l'attribut brut,
// mais pas au setter individuel que React utilise). Un pourcentage
// (`200%`) et un mot-clé (`hidden`) restent, eux, PARFAITEMENT observables —
// ce sont les seules valeurs que ce fichier peut vérifier au DOM. L'ARITHMÉTIQUE
// exacte (65/32.5/50 %) est prouvée par `lib/canvas/media-size.test.ts` (T-D8),
// jamais recopiée ici : ce témoin ne prouve que le CÂBLAGE (la boîte existe,
// porte `overflow:hidden`, et son crop interne est appliqué), le rendu réel
// en `cqw` se regarde au navigateur (`check-feed-scenes.mjs`, captures).
describe('ScenePlayer — un média posé a le rapport de sa charge, pas 60% (T-E3)', () => {
  test('un média posé porte une boîte à overflow:hidden (l’arithmétique 65/32.5% est prouvée par media-size.test.ts)', () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([
          { id: 'm1', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'img', aspectRatio: 2 } },
        ])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr']}
      />,
    );
    const box = el.querySelector('[data-scene-object="media"] > span') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.style.overflow).toBe('hidden');
  });

  test('cropX/Y/W/H ⇒ le conteneur porte overflow:hidden et l’<img> interne le style de mediaCropStyle', () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([
          {
            id: 'm1',
            kind: 'media',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'content',
            z: 1,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload: { postMediaId: 'img', aspectRatio: 2, cropX: 0, cropY: 0, cropW: 0.5, cropH: 1 },
          },
        ])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr']}
      />,
    );
    const box = el.querySelector('[data-scene-object="media"] > span') as HTMLElement | null;
    expect(box?.style.overflow).toBe('hidden');
    const img = el.querySelector('[data-scene-object="media"] img') as HTMLElement | null;
    expect(img?.style.width).toBe('200%');
  });

  test('un média posé indisponible masque l’<img> lui-même (hidden), pas une boîte grise (le cadre reste)', () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([
          { id: 'm1', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'img', aspectRatio: 1 } },
        ])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        // Un vrai PNG décodable — sinon happy-dom fait échouer le décodage
        // DÈS le montage (aucun réseau) et l'assertion "pas encore masqué"
        // mesurerait un artefact d'environnement, pas le comportement.
        carrier={{ postId: 'p1', media: [{ id: 'img', src: MEDIA_IMAGE_DATA_URI }] }}
        preferredLanguages={['fr']}
      />,
    );
    const img = el.querySelector('[data-scene-object="media"] img') as HTMLImageElement | null;
    expect(img?.hidden).toBe(false);
    act(() => {
      img?.dispatchEvent(new window.Event('error'));
    });
    expect(img?.hidden).toBe(true);
    // Le CADRE reste (pas un `return null` du composant entier) — la pose
    // continue d'exister, seule l'image casse.
    expect(el.querySelector('[data-scene-object="media"]')).not.toBeNull();
  });
});

// T-E4 — la pose est appliquée au DOM.
describe('ScenePlayer — la pose est appliquée au DOM (T-E4)', () => {
  test('scale 1.5, rotation 30, opacity 0.5, ancre libre {0.3,0.7} ⇒ left/top/transform/opacity', () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([textObject({ transform: { scale: 1.5, rotation: 30, opacity: 0.5 } })])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr']}
      />,
    );
    const frame = el.querySelector('[data-scene-object="text"]') as HTMLElement | null;
    expect(frame?.style.left).toBe('30%');
    expect(frame?.style.top).toBe('70%');
    expect(frame?.style.transform).toBe('translate(-50%, -50%) rotate(30deg) scale(1.5)');
    expect(frame?.style.opacity).toBe('0.5');
  });

  test('ancre band bottom ⇒ top: 92%', () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([textObject({ anchor: { t: 'band', edge: 'bottom' } })])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr']}
      />,
    );
    const frame = el.querySelector('[data-scene-object="text"]') as HTMLElement | null;
    expect(frame?.style.top).toBe('92%');
  });
});

/** Un stub de `requestAnimationFrame`/`cancelAnimationFrame` en FILE — les
 * témoins de l'horloge (T-E5/E6/E8) jouent les rappels EUX-MÊMES, à des
 * timestamps choisis, plutôt que d'attendre un vrai timer. */
function withRafQueue<T>(run: (flushTo: (ms: number) => void) => T): T {
  const queue: Array<(t: number) => void> = [];
  let raised = 0;
  const originalRaf = window.requestAnimationFrame;
  const originalCaf = window.cancelAnimationFrame;
  let nextId = 1;
  const ids = new Map<number, (t: number) => void>();
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = nextId++;
    ids.set(id, cb as (t: number) => void);
    queue.push(cb as (t: number) => void);
    return id;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) => {
    ids.delete(id);
  }) as typeof window.cancelAnimationFrame;
  const flushTo = (ms: number) => {
    // Rejoue le SEUL callback en file avec le timestamp demandé — le tick
    // REPLANIFIE lui-même le suivant (boucle `rAF` réelle) : vider la file
    // en boucle jusqu'à vide boucherait pour toujours, puisque chaque
    // callback en repousse un nouveau.
    const cb = queue.shift();
    raised += 1;
    if (raised > 500) throw new Error('boucle rAF sans fin — garde de test');
    if (cb !== undefined) act(() => cb(ms));
  };
  try {
    return run(flushTo);
  } finally {
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCaf;
  }
}

// T-E5 — l'horloge n'existe que si la scène est temporisée, et écrit sans re-rendre.
describe('ScenePlayer — l’horloge n’existe que si la scène est temporisée (T-E5)', () => {
  test('un texte à keyframes, playing ⇒ le style avance avec le temps, sans re-rendre', () => {
    withRafQueue((flushTo) => {
      let renders = 0;
      function Spy({ children }: { readonly children: unknown }) {
        renders += 1;
        return <>{children}</>;
      }
      const el = mount(
        <Spy>
          <ScenePlayer
            document={sceneDocumentOf([
              textObject({
                anchor: { t: 'free', x: 0.5, y: 0.5 },
                timing: { start: 0, keyframes: [{ time: 0, x: 0.1, y: 0.1 }, { time: 2, x: 0.9, y: 0.9 }] },
              }),
            ])}
            sceneIndex={0}
            mode="reader"
            playing
            carrier={carrier}
            preferredLanguages={['fr']}
          />
        </Spy>,
      );
      const before = renders;
      flushTo(0);
      flushTo(1000); // +1s ⇒ t=1
      const frame1 = el.querySelector('[data-scene-object="text"]') as HTMLElement | null;
      expect(frame1?.style.left).toBe('50%');
      flushTo(2000); // +1s de plus ⇒ t=2
      const frame2 = el.querySelector('[data-scene-object="text"]') as HTMLElement | null;
      expect(frame2?.style.left).toBe('90%');
      expect(renders).toBe(before);
    });
  });

  test('scène SANS objet temporisé ⇒ requestAnimationFrame jamais appelé', () => {
    let called = 0;
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = ((_cb: FrameRequestCallback) => {
      called += 1;
      return 0;
    }) as typeof window.requestAnimationFrame;
    try {
      mount(
        <ScenePlayer document={sceneDocumentOf([textObject({})])} sceneIndex={0} mode="reader" playing carrier={carrier} preferredLanguages={['fr']} />,
      );
      expect(called).toBe(0);
    } finally {
      window.requestAnimationFrame = originalRaf;
    }
  });

  test('playing=false ⇒ aucun rappel planifié (l’horloge s’arrête)', () => {
    let called = 0;
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = ((_cb: FrameRequestCallback) => {
      called += 1;
      return 0;
    }) as typeof window.requestAnimationFrame;
    try {
      mount(
        <ScenePlayer
          document={sceneDocumentOf([textObject({ timing: { start: 0, keyframes: [{ time: 0, x: 0.1, y: 0.1 }, { time: 2, x: 0.9, y: 0.9 }] } })])}
          sceneIndex={0}
          mode="reader"
          playing={false}
          carrier={carrier}
          preferredLanguages={['fr']}
        />,
      );
      expect(called).toBe(0);
    } finally {
      window.requestAnimationFrame = originalRaf;
    }
  });

  test('onTime reçoit des secondes croissantes', () => {
    withRafQueue((flushTo) => {
      const times: number[] = [];
      mount(
        <ScenePlayer
          document={sceneDocumentOf([textObject({ timing: { start: 0, keyframes: [{ time: 0, x: 0.1, y: 0.1 }, { time: 5, x: 0.9, y: 0.9 }] } })])}
          sceneIndex={0}
          mode="reader"
          playing
          carrier={carrier}
          preferredLanguages={['fr']}
          onTime={(t) => times.push(t)}
        />,
      );
      flushTo(0);
      flushTo(200); // ≥ 100ms depuis le dernier onTime ⇒ throttle franchi
      flushTo(400);
      expect(times.length).toBeGreaterThan(0);
      for (let i = 1; i < times.length; i += 1) expect(times[i]).toBeGreaterThan(times[i - 1] ?? -1);
    });
  });
});

// T-E8 — un objet hors fenêtre n'est pas peint.
describe('ScenePlayer — un objet hors fenêtre n’est pas peint (T-E8)', () => {
  test("timing.start: 3 monté à t=0 ⇒ hidden ; après rappels à t=3 ⇒ visible", () => {
    withRafQueue((flushTo) => {
      const el = mount(
        <ScenePlayer
          document={sceneDocumentOf([textObject({ timing: { start: 3 } })], { timelineDuration: 10 })}
          sceneIndex={0}
          mode="reader"
          playing
          carrier={carrier}
          preferredLanguages={['fr']}
        />,
      );
      const frame = () => el.querySelector('[data-scene-object="text"]') as HTMLElement | null;
      expect(frame()?.hidden).toBe(true);
      flushTo(0);
      flushTo(3000);
      expect(frame()?.hidden).toBe(false);
    });
  });
});

// T-E9 — le dessin est plein cadre, en espace design.
describe('ScenePlayer — le dessin est plein cadre, en espace design (T-E9)', () => {
  test('svg viewBox 1080×1920, un polyline par trait non-gomme, couleur et opacité du feutre', () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([
          {
            id: 'd1',
            kind: 'drawing',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'fg',
            z: 1,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload: {
              strokes: [
                { points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], width: 6, tool: 'pen', colorHex: 'FF3B30' },
                { points: [{ x: 0, y: 0 }, { x: 50, y: 50 }], width: 6, tool: 'marker' },
                { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], width: 6, tool: 'eraser' },
              ],
            },
          },
        ])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr']}
      />,
    );
    const svg = el.querySelector('[data-scene-object="drawing"] svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 1080 1920');
    const lines = el.querySelectorAll('[data-scene-object="drawing"] polyline');
    expect(lines.length).toBe(2); // eraser écarté
    expect(lines[0]?.getAttribute('stroke')).toBe('#FF3B30');
    expect(lines[1]?.getAttribute('stroke-opacity')).toBe('0.45');
  });
});

// T-E10 — le lieu et le sticker.
describe('ScenePlayer — le lieu et le sticker (T-E10)', () => {
  test('lieu {name} ⇒ le nom ; sans nom ni adresse ⇒ le repli localisé', () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([
          { id: 'p1', kind: 'place', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { place: { name: 'Café Central' } } },
        ])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr']}
      />,
    );
    expect(el.querySelector('[data-scene-object="place"]')?.textContent).toContain('Café Central');
  });

  // T-D10 prouve `stickerWidthFraction(270,1) === 270/1080` (25 %) par
  // l'API pure ; happy-dom rejette l'unité `cqw` à l'assignation de style
  // (sonde ci-dessus, § T-E3) — ce témoin DOM ne peut donc verifier que le
  // CÂBLAGE (le glyphe est peint avec un `role="img"` et un `aria-label`),
  // pas la chaîne `25cqw` elle-même.
  test('sticker emoji:🔥, baseSize:270 ⇒ le glyphe est peint (role=img, aria-label)', () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([
          { id: 's1', kind: 'sticker', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { emoji: '🔥', baseSize: 270 } },
        ])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr']}
      />,
    );
    const glyph = el.querySelector('[data-scene-object="sticker"] [role="img"]') as HTMLElement | null;
    expect(glyph?.getAttribute('aria-label')).toBe('🔥');
    expect(glyph?.textContent).toBe('🔥');
  });

  test('sticker postMediaId présent au porteur ⇒ <img>', () => {
    const el = mount(
      <ScenePlayer
        document={sceneDocumentOf([
          { id: 's2', kind: 'sticker', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'img' } },
        ])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr']}
      />,
    );
    expect(el.querySelector('[data-scene-object="sticker"] img')).not.toBeNull();
  });
});

// T-E11 — l'audio non-fond suit lecture et muet.
describe('ScenePlayer — l’audio non-fond suit lecture et muet (T-E11)', () => {
  test('placement overlay, postMediaId au porteur ⇒ src, muted du mode, play()/pause() selon playing', () => {
    const playSpy = { calls: 0 };
    const pauseSpy = { calls: 0 };
    const originalPlay = window.HTMLMediaElement.prototype.play;
    const originalPause = window.HTMLMediaElement.prototype.pause;
    window.HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      playSpy.calls += 1;
      return Promise.resolve();
    };
    window.HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
      pauseSpy.calls += 1;
    };
    try {
      const el = mount(
        <ScenePlayer
          document={sceneDocumentOf([
            { id: 'a1', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1, transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { postMediaId: 'clip', placement: 'overlay' } },
          ])}
          sceneIndex={0}
          mode="reader"
          playing
          carrier={{ postId: 'p1', media: [{ id: 'clip', src: 'clip.mp3' }] }}
          preferredLanguages={['fr']}
        />,
      );
      const audio = el.querySelector('[data-scene-object="audio"] audio') as HTMLAudioElement | null;
      expect(audio?.getAttribute('src')).toBe('clip.mp3');
      expect(audio?.muted).toBe(false); // reader est sonore
      expect(playSpy.calls).toBeGreaterThan(0);
    } finally {
      window.HTMLMediaElement.prototype.play = originalPlay;
      window.HTMLMediaElement.prototype.pause = originalPause;
    }
  });
});
