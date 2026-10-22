import { afterAll, afterEach, beforeAll } from 'bun:test';
import { act } from 'react';

import type { CameraResult } from '@/lib/game-photo/camera';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { rankMoment, type PhotoMoment } from '@/lib/game-photo/moments';
import type { KeepOutcome, KeptPhoto, Notebook } from '@/lib/game-photo/notebook';
import type { PhotoReferral } from '@/lib/game-photo/referral';
import type { PhotoFiles } from '@/lib/game-photo/render';
import type { ShareOutcome } from '@/lib/game-photo/share';
import type { PhotoFlowResult } from '@/components/game-photo-flow';
import { GamePhotoFlow } from '@/components/game-photo-flow';

import { createActMounter } from './act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from './happy-dom-environment';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/**
 * LE HARNAIS DU DÉROULÉ PHOTO (#9382) — ce que chaque fichier de témoins du
 * déroulé partage : l'environnement happy-dom et son monteur `act`, les
 * sélecteurs du dialogue, l'environnement DOUBLÉ (`env`) qui journalise tout
 * ce que le déroulé lui demande, et l'ouverture d'un moment. Extrait de
 * `game-photo-flow.test.tsx` quand il a dépassé le budget de lignes : les
 * témoins du cadre décoré (#10159) vivent dans leur propre fichier.
 */
export const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 15)));
export const choose = (host: ParentNode, id: string) => host.querySelector<HTMLElement>(`[data-photo-choice="${id}"]`);
export const by = (host: ParentNode, attribute: string) => host.querySelector<HTMLElement>(`[${attribute}]`);
export const takeFrame = (host: ParentNode) => host.querySelector<HTMLElement>('[data-photo-take="frame"]');
export const scene = (host: ParentNode) => host.querySelector<HTMLElement>('[data-photo-take="scene"]');

export type FlowLog = {
  stops: number;
  cameraOpened: number;
  kept: { moment: PhotoMoment; photo: KeptPhoto }[];
  deferred: PhotoMoment[];
  shared: { file: File; title: string }[];
  /** Le texte qui accompagnait chaque partage (#7742). */
  texts: (string | undefined)[];
  /** Le bandeau de parrainage de chaque composition (#7742). */
  referrals: (PhotoReferral | null | undefined)[];
  /** La date que chaque composition porte sur la carte (#10166) ; `undefined` : aujourd'hui. */
  dates: (Date | undefined)[];
  saved: File[];
  /** Les fichiers rendus par chaque composition, dans l'ordre. */
  outputs: PhotoFiles[];
  rendered: { moment: PhotoMoment; mirror: boolean | null }[];
  closed: PhotoFlowResult[];
};

export const files = (): PhotoFiles => ({
  story: new File(['s'], 'meeshy-story.png', { type: 'image/png' }),
  square: new File(['q'], 'meeshy-profil.png', { type: 'image/png' }),
});

export function env(overrides: Partial<PhotoEnv> & { camera?: CameraResult | 'pending'; keepOk?: boolean; keepOutcome?: KeepOutcome; shareOutcome?: ShareOutcome; renderOk?: boolean } = {}) {
  const log: FlowLog = { stops: 0, cameraOpened: 0, kept: [], deferred: [], shared: [], texts: [], referrals: [], dates: [], saved: [], outputs: [], rendered: [], closed: [] };
  const notebook: Notebook = {
    defer: async (moment) => (log.deferred.push(moment), true),
    keep: async (moment, photo) => (log.kept.push({ moment, photo }), overrides.keepOutcome ?? (overrides.keepOk === false ? 'unavailable' : 'kept')),
    list: async () => [],
    remove: async () => true,
  };
  const live: CameraResult = { ok: true, session: { stream: new MediaStream(), stop: () => void (log.stops += 1) } };
  const value: PhotoEnv = {
    openCamera: async () => {
      log.cameraOpened += 1;
      return overrides.camera === 'pending' ? new Promise<CameraResult>(() => undefined) : (overrides.camera ?? live);
    },
    notebook,
    share: async (file, title, text) => (log.shared.push({ file, title }), log.texts.push(text), overrides.shareOutcome ?? 'shared'),
    save: async (file) => (log.saved.push(file), 'downloaded'),
    render: async ({ moment, photo, referral, at }) => {
      log.rendered.push({ moment, mirror: photo === null ? null : photo.mirror });
      log.referrals.push(referral);
      log.dates.push(at);
      if (overrides.renderOk === false) return null;
      const output = files();
      log.outputs.push(output);
      return output;
    },
    captureVideo: () => ({ image: {} as CanvasImageSource, width: 1080, height: 1920, mirror: true }),
    readGallery: async () => ({ image: {} as CanvasImageSource, width: 800, height: 600, mirror: false }),
    now: () => new Date('2026-10-05T10:00:00.000Z'),
    playOptions: {
      reducedMotion: false,
      haptics: false,
      schedule: (run) => {
        run();
        return () => undefined;
      },
    },
  };
  return { env: { ...value, ...overrides } as PhotoEnv, log };
}

export const rank = rankMoment({ rank: 'voix', division: 2 });

/** Enregistre les hooks du fichier (happy-dom, `act`, démontage après chaque témoin) et rend le monteur avec l'ouverture d'un moment. */
export function setupGamePhotoFlowTests() {
  const { mount, unmountAll, click, rerender } = createActMounter();
  beforeAll(() => {
    ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });
  afterEach(unmountAll);
  const open = async (moment: PhotoMoment, e: PhotoEnv, log: FlowLog) =>
    mount(<GamePhotoFlow moment={moment} env={e} onClose={(result) => log.closed.push(result)} />);
  return { mount, unmountAll, click, rerender, open };
}
