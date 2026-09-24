import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { protectedMediaDeps, type ProtectedMediaDeps } from '@/lib/api/protected-media';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasObject } from '@/lib/canvas/document';

import { SceneObjectAudio, defaultAudioMediaDeps } from './scene-object-audio';

/**
 * #7015, revue-correction — **LE SON POSÉ EST LE DEUXIÈME `<audio>` À LIRE LA
 * MÊME SOURCE, ET IL N'AVAIT PAS REÇU LE CORRECTIF.**
 *
 * `electBackgroundTrack` n'élit que l'objet audio `isBackground === true` ; un
 * son posé en AVANT-PLAN (`isBackground` absent ou faux) tombe dans cette
 * couche-ci, qui résout sa source par `objectMediaSrc` — le MÊME
 * `attachmentSrc(payload.mediaURL)` que l'élection, donc la MÊME URL
 * `/api/v1/static/…` quand la piste est EMPRUNTÉE à la bibliothèque.
 *
 * Ce n'est pas un cas de laboratoire : iOS sépare explicitement les deux
 * champs — « le CRÉDIT : `soundId` ; le rôle de MIXAGE : `isBackground`,
 * **n'importe quel son** » (`ComposerHostRules.swift:684-694`) — et le porteur
 * a demandé le 2026-08-30 « les mettre en background **ou en foreground** ».
 * Une piste empruntée posée en avant-plan par un auteur iOS arrive donc ici,
 * avec une URL que la balise ne peut PAS charger : la requête part sans
 * `Authorization` et rend `401`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let playCalls = 0;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    playCalls += 1;
    return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {};
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

const SON_PROTEGE = '/api/v1/static/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a';
const CARRIER: SceneCarrier = { postId: 'p1', media: [] };

/** Un son POSÉ — `isBackground` absent, donc ignoré par `electBackgroundTrack`
 * et rendu par cette couche. Passé par le parseur RÉEL : jamais un objet
 * fabriqué à la main, qui pourrait porter une forme que le produit ne connaît
 * pas. */
function posedSound(mediaURL: string): CanvasObject {
  const document = parseCanvasDocument({
    v: 3,
    scenes: [
      {
        id: 's1',
        objects: [
          {
            id: 'a1',
            kind: 'audio',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'fg',
            z: 1,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload: { mediaURL, volume: 1 },
          },
        ],
      },
    ],
  });
  const object = document?.scenes[0]?.objects[0];
  if (object === undefined) throw new Error('vecteur invalide');
  return object;
}

/** Le type que la route SERT (`EXT_TO_MIME`, `soundFormats.ts`) — un `200`
 * non typé n'est plus une piste depuis la revue-correction. */
function depsDeTest(options: { readonly typeServi?: string; readonly statut?: number } = {}): ProtectedMediaDeps {
  return {
    credential: () => ({ kind: 'registered', token: 'jwt-1' }),
    fetchImpl: (() =>
      Promise.resolve(
        options.statut !== undefined && options.statut !== 200
          ? new Response('', { status: options.statut })
          : new Response(new Blob(['octets'], { type: options.typeServi ?? 'audio/x-m4a' }), { status: 200 }),
      )) as typeof fetch,
    createObjectURL: () => 'blob:meeshy/pose',
    revokeObjectURL: () => undefined,
  };
}

function audioOf(el: HTMLDivElement): HTMLAudioElement | null {
  return el.querySelector('audio');
}

describe('SceneObjectAudio — un son POSÉ emprunté à la bibliothèque (#7015)', () => {
  test('l’URL protégée n’est JAMAIS posée en `src` — l’élément reçoit une URL d’objet', async () => {
    const el = mount(
      <SceneObjectAudio
        object={posedSound(SON_PROTEGE)}
        carrier={CARRIER}
        playing
        muted={false}
        clock={null}
        onPlaybackBlocked={undefined}
        mediaDeps={depsDeTest()}
      />,
    );
    // Avant résolution : aucune balise, donc aucune requête anonyme au 401.
    expect(audioOf(el)).toBeNull();
    await act(async () => {});
    const audio = audioOf(el);
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute('src')).toBe('blob:meeshy/pose');
    expect(audio?.getAttribute('src')).not.toContain('/api/v1/static/');
    // La piste JOUE : l'effet doit se rejouer sur la source RÉSOLUE, sinon il
    // ne tourne qu'une fois, sur un `ref` nul.
    expect(playCalls).toBe(1);
  });

  test('le SPA qui répond `200 text/html` ⇒ AUCUNE balise (dégradation dessinée)', async () => {
    const el = mount(
      <SceneObjectAudio
        object={posedSound(SON_PROTEGE)}
        carrier={CARRIER}
        playing
        muted={false}
        clock={null}
        onPlaybackBlocked={undefined}
        mediaDeps={depsDeTest({ typeServi: 'text/html' })}
      />,
    );
    await act(async () => {});
    expect(audioOf(el)).toBeNull();
    expect(playCalls).toBe(0);
  });

  test('un refus (401) ⇒ AUCUNE balise, aucune promesse rejetée', async () => {
    const rejets: unknown[] = [];
    const noter = (reason: unknown) => rejets.push(reason);
    process.on('unhandledRejection', noter);
    const el = mount(
      <SceneObjectAudio
        object={posedSound(SON_PROTEGE)}
        carrier={CARRIER}
        playing
        muted={false}
        clock={null}
        onPlaybackBlocked={undefined}
        mediaDeps={depsDeTest({ statut: 401 })}
      />,
    );
    await act(async () => {});
    await new Promise((resolve) => setImmediate(resolve));
    process.off('unhandledRejection', noter);
    expect(audioOf(el)).toBeNull();
    expect(rejets).toEqual([]);
  });

  test('CONTRASTE — une pièce jointe ordinaire reste posée TELLE QUELLE, sans requête', () => {
    let appels = 0;
    const el = mount(
      <SceneObjectAudio
        object={posedSound('/api/v1/attachments/file/2026%2F09%2Fvoix.m4a')}
        carrier={CARRIER}
        playing
        muted={false}
        clock={null}
        onPlaybackBlocked={undefined}
        mediaDeps={{
          ...depsDeTest(),
          fetchImpl: (() => {
            appels += 1;
            return Promise.resolve(new Response('', { status: 200 }));
          }) as typeof fetch,
        }}
      />,
    );
    expect(audioOf(el)?.getAttribute('src')).toContain('/api/v1/attachments/file/');
    expect(appels).toBe(0);
  });

  test('LA LOI EST BRANCHÉE — sans `mediaDeps`, la couche prend les dépendances de PRODUCTION', () => {
    expect(defaultAudioMediaDeps).toBe(protectedMediaDeps);
  });
});
