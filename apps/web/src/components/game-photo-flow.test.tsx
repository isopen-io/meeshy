import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { CameraResult } from '@/lib/game-photo/camera';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { rankMoment, startMoment, type PhotoMoment } from '@/lib/game-photo/moments';
import type { KeptPhoto, Notebook } from '@/lib/game-photo/notebook';
import type { PhotoFiles } from '@/lib/game-photo/render';
import type { ShareOutcome } from '@/lib/game-photo/share';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GamePhotoFlow, type PhotoFlowResult } from './game-photo-flow';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 15)));
const choose = (host: ParentNode, id: string) => host.querySelector<HTMLElement>(`[data-photo-choice="${id}"]`);
const by = (host: ParentNode, attribute: string) => host.querySelector<HTMLElement>(`[${attribute}]`);

type Log = {
  stops: number;
  cameraOpened: number;
  kept: { moment: PhotoMoment; photo: KeptPhoto }[];
  deferred: PhotoMoment[];
  shared: { file: File; title: string }[];
  saved: File[];
  rendered: { moment: PhotoMoment; mirror: boolean | null }[];
  closed: PhotoFlowResult[];
};

const files = (): PhotoFiles => ({
  story: new File(['s'], 'meeshy-story.png', { type: 'image/png' }),
  square: new File(['q'], 'meeshy-profil.png', { type: 'image/png' }),
});

function env(overrides: Partial<PhotoEnv> & { camera?: CameraResult | 'pending'; keepOk?: boolean; shareOutcome?: ShareOutcome; renderOk?: boolean } = {}) {
  const log: Log = { stops: 0, cameraOpened: 0, kept: [], deferred: [], shared: [], saved: [], rendered: [], closed: [] };
  const notebook: Notebook = {
    defer: async (moment) => (log.deferred.push(moment), true),
    keep: async (moment, photo) => (log.kept.push({ moment, photo }), overrides.keepOk ?? true),
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
    share: async (file, title) => (log.shared.push({ file, title }), overrides.shareOutcome ?? 'shared'),
    save: (file) => (log.saved.push(file), true),
    render: async ({ moment, photo }) => {
      log.rendered.push({ moment, mirror: photo === null ? null : photo.mirror });
      return overrides.renderOk === false ? null : files();
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

const open = async (moment: PhotoMoment, e: PhotoEnv, log: Log) =>
  mount(<GamePhotoFlow moment={moment} env={e} onClose={(result) => log.closed.push(result)} />);

const rank = rankMoment({ rank: 'voix', division: 2 });

/**
 * LES MOMENTS PHOTO (#9382) — conception, partie VI, de la proposition au
 * partage. Aucune image n'est envoyée au serveur : le carnet est local, le
 * partage passe par le système.
 */
describe('la proposition', () => {
  test('Mee propose trois choses : le selfie, la carte seule, plus tard — et dit où reste la photo', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    expect(choose(host, 'selfie')?.textContent).toBe('Selfie avec Mee et Meo');
    expect(choose(host, 'card')?.textContent).toBe('Carte seule');
    expect(choose(host, 'later')?.textContent).toBe('Plus tard');
    expect(host.textContent).toContain('On immortalise ?');
    expect(host.textContent).toContain('La photo reste sur ton appareil tant que tu ne la partages pas.');
  });

  test('c’est un dialogue nommé par le moment', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Photo : Voix II');
  });

  test('« plus tard » laisse le moment en attente dans le carnet, puis ferme', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'later'));
    await settle();
    expect(log.deferred.map((m) => m.id)).toEqual(['rank:voix:2']);
    expect(log.closed).toEqual([{ deferred: true }]);
  });

  test('fermer ne laisse RIEN en attente', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(by(host, 'data-photo-close'));
    await settle();
    expect(log.deferred).toEqual([]);
    expect(log.closed).toEqual([{ deferred: false }]);
  });

  test('la caméra ne s’ouvre pas avant le choix du selfie', async () => {
    const { env: e, log } = env();
    await open(rank, e, log);
    expect(log.cameraOpened).toBe(0);
  });
});

describe('le selfie', () => {
  test('la caméra s’ouvre, puis le déclencheur est là, nommé', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(log.cameraOpened).toBe(1);
    expect(by(host, 'data-photo-shutter')?.getAttribute('aria-label')).toBe('Prendre la photo');
    expect(host.querySelector('video')).not.toBeNull();
  });

  test('le cadre du moment se pose sur l’aperçu', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(host.querySelector('[data-photo-frame]')).not.toBeNull();
    expect(host.querySelector('[data-photo-art="emblem"]')).not.toBeNull();
  });

  test('pendant l’ouverture : le déclencheur n’existe pas encore, l’état se dit', async () => {
    const { env: e, log } = env({ camera: 'pending' });
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(by(host, 'data-photo-shutter')).toBeNull();
    expect(host.textContent).toContain('Ouverture de la caméra');
  });

  test('le déclencheur frappe : la photo est composée (retournée), le résultat s’affiche', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(by(host, 'data-photo-shutter'));
    await settle();
    expect(log.rendered).toEqual([{ moment: rank, mirror: true }]);
    expect(by(host, 'data-photo-share')).not.toBeNull();
  });

  test('la caméra est rendue quand on a déclenché', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(by(host, 'data-photo-shutter'));
    await settle();
    expect(log.stops).toBeGreaterThanOrEqual(1);
  });

  test('la caméra est rendue aussi quand on ferme sans déclencher', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(by(host, 'data-photo-close'));
    await settle();
    expect(log.stops).toBeGreaterThanOrEqual(1);
  });
});

describe('une caméra refusée n’est pas une impasse', () => {
  const refused = (reason: 'denied' | 'unsupported' | 'unavailable') => env({ camera: { ok: false, reason } });

  for (const reason of ['denied', 'unsupported', 'unavailable'] as const) {
    test(`${reason} : un message qui dit quoi faire, la galerie et la carte seule`, async () => {
      const { env: e, log } = refused(reason);
      const host = await open(rank, e, log);
      await click(choose(host, 'selfie'));
      await settle();
      expect(by(host, 'data-photo-shutter')).toBeNull();
      expect(host.querySelector('[role="alert"]')?.textContent?.length).toBeGreaterThan(20);
      expect(by(host, 'data-photo-gallery')).not.toBeNull();
      expect(choose(host, 'card')).not.toBeNull();
    });
  }

  test('le refus nomme le remède : réautoriser', async () => {
    const { env: e, log } = refused('denied');
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Autorise');
  });

  test('la carte seule reste possible après un refus', async () => {
    const { env: e, log } = refused('denied');
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(choose(host, 'card'));
    await settle();
    expect(log.rendered).toEqual([{ moment: rank, mirror: null }]);
  });

  test('une photo de la galerie se compose, SANS être retournée', async () => {
    const { env: e, log } = refused('unsupported');
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input?.getAttribute('accept')).toBe('image/*');
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'moi.jpg', { type: 'image/jpeg' })] });
    await act(async () => {
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(log.rendered).toEqual([{ moment: rank, mirror: false }]);
  });
});

describe('la carte seule', () => {
  test('aucune caméra, aucune photo : la frappe se joue et la carte se compose', async () => {
    const { env: e, log } = env();
    const host = await open(startMoment(), e, log);
    await click(choose(host, 'card'));
    await settle();
    expect(log.cameraOpened).toBe(0);
    expect(log.rendered).toEqual([{ moment: startMoment(), mirror: null }]);
    expect(by(host, 'data-photo-keep')).not.toBeNull();
  });
});

describe('le résultat : partager, enregistrer, garder', () => {
  const toResult = async (overrides: Parameters<typeof env>[0] = {}) => {
    const bench = env(overrides);
    const host = await open(rank, bench.env, bench.log);
    await click(choose(host, 'card'));
    await settle();
    return { ...bench, host };
  };

  test('le partage envoie l’image choisie — la story par défaut — avec le titre du moment', async () => {
    const { host, log } = await toResult();
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(log.shared).toHaveLength(1);
    expect(log.shared[0]?.file.name).toBe('meeshy-story.png');
    expect(log.shared[0]?.title).toBe('Voix II');
  });

  test('le format profil (1:1) se choisit, et c’est lui qui part', async () => {
    const { host, log } = await toResult();
    await click(by(host, 'data-photo-format="square"'));
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(log.shared[0]?.file.name).toBe('meeshy-profil.png');
  });

  test('un partage qui se replie sur le téléchargement le dit', async () => {
    const { host } = await toResult({ shareOutcome: 'downloaded' });
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(host.textContent).toContain('Image enregistrée');
  });

  test('un partage fermé par l’utilisateur ne dit rien de faux', async () => {
    const { host } = await toResult({ shareOutcome: 'cancelled' });
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(host.textContent).not.toContain('Image enregistrée');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  test('un partage qui échoue se dit en alerte', async () => {
    const { host } = await toResult({ shareOutcome: 'failed' });
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('n’a pas pu');
  });

  test('« Enregistrer » télécharge le fichier choisi', async () => {
    const { host, log } = await toResult();
    await click(by(host, 'data-photo-save'));
    await settle();
    expect(log.saved.map((f) => f.name)).toEqual(['meeshy-story.png']);
    expect(host.textContent).toContain('Image enregistrée');
  });

  test('« Garder au carnet » garde LES DEUX images, avec le mode, et le dit', async () => {
    const { host, log } = await toResult();
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(log.kept).toHaveLength(1);
    expect(log.kept[0]?.photo.mode).toBe('card');
    expect((log.kept[0]?.photo.story as File).name).toBe('meeshy-story.png');
    expect((log.kept[0]?.photo.square as File).name).toBe('meeshy-profil.png');
    expect(host.textContent).toContain('Gardée au carnet');
  });

  test('un carnet qui refuse : on le dit, et la photo reste partageable', async () => {
    const { host } = await toResult({ keepOk: false });
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('carnet');
    expect(by(host, 'data-photo-share')).not.toBeNull();
  });

  test('fermer le résultat ne laisse rien en attente', async () => {
    const { host, log } = await toResult();
    await click(by(host, 'data-photo-close'));
    await settle();
    expect(log.deferred).toEqual([]);
    expect(log.closed).toEqual([{ deferred: false }]);
  });
});

describe('quand le navigateur ne sait pas composer', () => {
  test('un message net et une sortie, jamais un écran figé', async () => {
    const { env: e, log } = env({ renderOk: false });
    const host = await open(rank, e, log);
    await click(choose(host, 'card'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ne sait pas composer');
    await click(by(host, 'data-photo-close'));
    await settle();
    expect(log.closed).toEqual([{ deferred: false }]);
  });
});

describe('le clavier', () => {
  test('Échap ferme', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await act(async () => {
      host.querySelector('[role="dialog"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    expect(log.closed).toEqual([{ deferred: false }]);
  });

  test('les boutons font 44 points au moins', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    for (const button of Array.from(host.querySelectorAll('button'))) {
      expect(button.getAttribute('style') ?? '').toContain('min-height: 44px');
    }
  });
});
