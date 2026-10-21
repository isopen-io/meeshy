import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { CameraResult } from '@/lib/game-photo/camera';
import type { PhotoSource } from '@/lib/game-photo/compose';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { rankMoment, startMoment, type PhotoMoment } from '@/lib/game-photo/moments';
import type { KeepOutcome, KeptPhoto, Notebook } from '@/lib/game-photo/notebook';
import type { PhotoReferral } from '@/lib/game-photo/referral';
import type { PhotoFiles } from '@/lib/game-photo/render';
import type { ShareOutcome } from '@/lib/game-photo/share';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
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
const takeFrame = (host: ParentNode) => host.querySelector<HTMLElement>('[data-photo-take="frame"]');
const scene = (host: ParentNode) => host.querySelector<HTMLElement>('[data-photo-take="scene"]');

type Log = {
  stops: number;
  cameraOpened: number;
  kept: { moment: PhotoMoment; photo: KeptPhoto }[];
  deferred: PhotoMoment[];
  shared: { file: File; title: string }[];
  /** Le texte qui accompagnait chaque partage (#7742). */
  texts: (string | undefined)[];
  /** Le bandeau de parrainage de chaque composition (#7742). */
  referrals: (PhotoReferral | null | undefined)[];
  saved: File[];
  /** Les fichiers rendus par chaque composition, dans l'ordre. */
  outputs: PhotoFiles[];
  rendered: { moment: PhotoMoment; mirror: boolean | null }[];
  closed: PhotoFlowResult[];
};

const files = (): PhotoFiles => ({
  story: new File(['s'], 'meeshy-story.png', { type: 'image/png' }),
  square: new File(['q'], 'meeshy-profil.png', { type: 'image/png' }),
});

function env(overrides: Partial<PhotoEnv> & { camera?: CameraResult | 'pending'; keepOk?: boolean; keepOutcome?: KeepOutcome; shareOutcome?: ShareOutcome; renderOk?: boolean } = {}) {
  const log: Log = { stops: 0, cameraOpened: 0, kept: [], deferred: [], shared: [], texts: [], referrals: [], saved: [], outputs: [], rendered: [], closed: [] };
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
    render: async ({ moment, photo, referral }) => {
      log.rendered.push({ moment, mirror: photo === null ? null : photo.mirror });
      log.referrals.push(referral);
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
    expect(choose(host, 'selfie')?.textContent).toBe('Selfie avec nous');
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
  test('la caméra s’ouvre, puis la case du cadre est là, nommée : c’est elle qui déclenche', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(log.cameraOpened).toBe(1);
    expect(takeFrame(host)?.textContent).toContain('Voix II');
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

  test('la scène garde son 9:16 quand le panneau déborde : elle ne se tasse pas, sa largeur suit sa hauteur bornée (#10293)', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    const stage = host.querySelector<HTMLElement>('[data-photo-stage]');
    expect(stage?.classList.contains('shrink-0')).toBe(true);
    expect(stage?.classList.contains('w-full')).toBe(false);
    const style = (stage?.getAttribute('style') ?? '').replace(/\s+/g, '');
    // La largeur bornée par la hauteur vit dans le style (`min(100%, calc(62dvh * 9 / 16))`, que happy-dom ne relit pas) :
    // la classe arbitraire d'avant n'avait AUCUNE règle dans la feuille servie (gate check-utilities, CI dev du 2026-10-13).
    expect([...(stage?.classList ?? [])].some((name) => name.startsWith('w-['))).toBe(false);
    expect(style).toContain('aspect-ratio:9/16');
    expect(style).not.toContain('max-height');
  });

  test('pendant l’ouverture : le déclencheur n’existe pas encore, l’état se dit', async () => {
    const { env: e, log } = env({ camera: 'pending' });
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(takeFrame(host)).toBeNull();
    expect(host.textContent).toContain('Ouverture de la caméra');
  });

  test('le déclencheur frappe : la photo est composée (retournée), le résultat s’affiche', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(takeFrame(host));
    await settle();
    expect(log.rendered).toEqual([{ moment: rank, mirror: true }]);
    expect(by(host, 'data-photo-share')).not.toBeNull();
  });

  test('la caméra est rendue quand on a déclenché', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(takeFrame(host));
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

describe('la photo se fige au déclenchement', () => {
  test('l’image prise reste à l’écran pendant la frappe — une caméra rendue ne laisse pas un écran noir', async () => {
    const { env: base, log } = env();
    const frozen = {
      ...base,
      captureVideo: () => ({
        image: { toBlob: (done: (blob: Blob | null) => void) => done(new Blob(['still'], { type: 'image/png' })) } as unknown as CanvasImageSource,
        width: 1080,
        height: 1920,
        mirror: true,
      }),
      render: () => new Promise<never>(() => undefined),
    } as PhotoEnv;
    const host = await open(rank, frozen, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(takeFrame(host));
    await settle();
    const still = host.querySelector('[data-photo-still]');
    expect(still).not.toBeNull();
    expect(still?.getAttribute('style') ?? '').toContain('scaleX(-1)');
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
      expect(takeFrame(host)).toBeNull();
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

  /* #10833 — dans la coque Android, deux refus et Android ne redemande plus :
     seule la fiche de l'app rend la caméra, comme aux composeurs (#8882, #10824). */
  test('dans la coque, la caméra refusée offre d’ouvrir les réglages de l’app', async () => {
    const opened: string[] = [];
    const { env: e, log } = env({ camera: { ok: false, reason: 'denied' }, openSettings: () => void opened.push('openApp') });
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    const settings = by(host, 'data-photo-camera-settings');
    expect(settings?.textContent).toBe('Ouvrir les réglages');
    await click(settings);
    expect(opened).toEqual(['openApp']);
  });

  test('sans porte vers les réglages (navigateur), ou pour une caméra absente, aucun bouton', async () => {
    for (const { reason, openSettings } of [
      { reason: 'denied', openSettings: null },
      { reason: 'unsupported', openSettings: () => undefined },
      { reason: 'unavailable', openSettings: () => undefined },
    ] as const) {
      const { env: e, log } = env({ camera: { ok: false, reason }, openSettings });
      const host = await open(rank, e, log);
      await click(choose(host, 'selfie'));
      await settle();
      expect(by(host, 'data-photo-camera-settings')).toBeNull();
      unmountAll();
    }
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

describe('l’image décodée d’une photo de la galerie est rendue (#9382)', () => {
  const released = (): { readonly sources: { closed: number }[]; readonly make: () => PhotoSource } => {
    const sources: { closed: number }[] = [];
    const make = (): PhotoSource => {
      const record = { closed: 0 };
      sources.push(record);
      return { image: {} as CanvasImageSource, width: 800, height: 600, mirror: false, release: () => void (record.closed += 1) };
    };
    return { sources, make };
  };

  const pick = async (host: HTMLElement, count = 1) => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'moi.jpg', { type: 'image/jpeg' })], configurable: true });
    await act(async () => {
      for (let index = 0; index < count; index += 1) input?.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  const toGallery = async (readGallery: PhotoEnv['readGallery']) => {
    const bench = env({ camera: { ok: false, reason: 'unsupported' }, readGallery });
    const host = await open(rank, bench.env, bench.log);
    await click(choose(host, 'selfie'));
    await settle();
    return { ...bench, host };
  };

  test('fermer le déroulé ferme l’image décodée : un ImageBitmap tient sa mémoire jusqu’à close()', async () => {
    const bench = released();
    const { host } = await toGallery(async () => bench.make());
    await pick(host);
    await settle();
    expect(bench.sources).toHaveLength(1);
    expect(bench.sources[0]?.closed).toBe(0);
    unmountAll();
    expect(bench.sources[0]?.closed).toBe(1);
  });

  test('remplacer la photo ferme la précédente, et seulement elle', async () => {
    const bench = released();
    const { host } = await toGallery(async () => bench.make());
    await pick(host, 2);
    await settle();
    expect(bench.sources).toHaveLength(2);
    expect(bench.sources.map((entry) => entry.closed)).toEqual([1, 0]);
  });

  test('une image qui arrive APRÈS la fermeture est fermée aussitôt', async () => {
    const bench = released();
    let arrive: (source: PhotoSource) => void = () => undefined;
    const { host } = await toGallery(() => new Promise<PhotoSource>((resolve) => (arrive = resolve)));
    await pick(host);
    unmountAll();
    await act(async () => arrive(bench.make()));
    expect(bench.sources[0]?.closed).toBe(1);
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

  test('« Enregistrer » sans porte (coque sans galerie ni téléchargement) se dit en alerte, jamais « enregistrée »', async () => {
    const { host } = await toResult({ save: async () => 'failed' });
    await click(by(host, 'data-photo-save'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('L’enregistrement n’a pas pu aboutir');
    expect(host.textContent).not.toContain('Image enregistrée');
  });

  test('« Enregistrer » replié sur la feuille de partage ne se dit pas « enregistrée » et garde le bouton (#10284)', async () => {
    const { host } = await toResult({ save: async () => 'shared' });
    await click(by(host, 'data-photo-save'));
    await settle();
    expect(host.textContent).not.toContain('Image enregistrée');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(by(host, 'data-photo-save')).not.toBeNull();
  });

  test('« Garder au carnet » garde le 9:16, avec le mode, sans source pour une carte seule, et le dit', async () => {
    const { host, log } = await toResult();
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(log.kept).toHaveLength(1);
    expect(log.kept[0]?.photo.mode).toBe('card');
    expect((log.kept[0]?.photo.story as File).name).toBe('meeshy-story.png');
    expect(log.kept[0]?.photo.source ?? null).toBeNull();
    expect(host.textContent).toContain('Gardée dans ta Chronique');
  });

  test('un selfie gardé emporte sa SOURCE réduite et sa recette (miroir) (#10161)', async () => {
    const developed: unknown[] = [];
    const source = new Blob(['jpeg'], { type: 'image/jpeg' });
    const { env: e, log } = env({ developSource: async (photo) => (developed.push(photo), source) });
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    await click(takeFrame(host));
    await settle();
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(developed).toHaveLength(1);
    expect(log.kept[0]?.photo.source).toBe(source);
    expect(log.kept[0]?.photo.recipe?.mirror).toBe(true);
    expect(log.kept[0]?.photo.mode).toBe('selfie');
  });

  test('le carnet garde le 9:16 ré-encodé en JPEG ; le partage garde le PNG (#10238)', async () => {
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
    const handed: Blob[] = [];
    const { host, log } = await toResult({ keptStory: async (story) => (handed.push(story), jpeg) });
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(handed.map((story) => (story as File).name)).toEqual(['meeshy-story.png']);
    expect(log.kept[0]?.photo.story).toBe(jpeg);
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(log.shared.map((shared) => shared.file.type)).toEqual(['image/png']);
  });

  test('plus de place sur l’appareil : un état d’erreur DESSINÉ propose la galerie, rien n’est gardé (#10161)', async () => {
    const { host, log } = await toResult({ keepOutcome: 'no-space' });
    await click(by(host, 'data-photo-keep'));
    await settle();
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Plus de place sur cet appareil');
    expect(host.textContent).not.toContain('Gardée dans ta Chronique');
    expect((by(host, 'data-photo-keep') as HTMLButtonElement | null)?.disabled).toBe(false);
    await click(alert?.querySelector<HTMLElement>('[data-photo-no-space-save]') ?? null);
    await settle();
    expect(log.saved.map((f) => f.name)).toEqual(['meeshy-story.png']);
  });

  test('un carnet qui refuse : on le dit, et la photo reste partageable', async () => {
    const { host } = await toResult({ keepOk: false });
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Chronique');
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

/**
 * UNE COUCHE MODALE, PAS SEULEMENT ANNONCÉE (revue #9382) — `aria-modal`
 * ANNONCE une modale, il n'en fait pas une (`components/sheet.tsx`). Le
 * déroulé s'ouvre depuis un bouton de la page : le focus doit y entrer, y
 * rester, et revenir au bouton à la fermeture ; Échap le ferme où que soit le
 * focus ; et le RETOUR matériel de la coque Android ferme le déroulé au lieu
 * de quitter l'écran Progression.
 */
describe('une vraie couche modale', () => {
  const opener = () => {
    const button = document.createElement('button');
    button.textContent = 'Immortaliser';
    document.body.append(button);
    button.focus();
    return button;
  };

  test('le focus entre dans le dialogue à l’ouverture, et revient à l’ouvreur à la fermeture', async () => {
    const { env: e, log } = env();
    const trigger = opener();
    const host = await open(rank, e, log);
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.contains(document.activeElement)).toBe(true);
    unmountAll();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  test('Échap ferme le déroulé même quand le focus est resté hors du dialogue', async () => {
    const { env: e, log } = env();
    const trigger = opener();
    await open(rank, e, log);
    trigger.focus();
    await act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    expect(log.closed).toEqual([{ deferred: false }]);
    trigger.remove();
  });

  test('le retour matériel (popstate) ferme le déroulé, sans rien laisser en attente', async () => {
    const { env: e, log } = env();
    await open(rank, e, log);
    expect(typeof (window.history.state as { backDismiss?: unknown } | null)?.backDismiss).toBe('string');
    await act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await settle();
    expect(log.deferred).toEqual([]);
    expect(log.closed).toEqual([{ deferred: false }]);
  });

  test('Tab depuis le dernier bouton revient au premier : le focus ne passe pas derrière', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
    const buttons = Array.from(dialog?.querySelectorAll<HTMLElement>('button') ?? []);
    buttons.at(-1)?.focus();
    await act(() => {
      buttons.at(-1)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(buttons[0] ?? null);
  });

  test('la case du cadre porte son texte visible dans son nom accessible', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    const shutter = takeFrame(host);
    const visible = shutter?.querySelector('[data-photo-take-label]')?.textContent ?? '∅';
    expect(shutter?.getAttribute('aria-label') ?? '').toContain(visible);
  });
});

/**
 * LE CADRE EST LE DÉCLENCHEUR (#10284) — directive porteur 2026-10-12 : aucun
 * cercle d'enregistrement en plus du cadre ; la case du cadre prend la photo,
 * l'enregistre dans la galerie (la galerie de la coque Android, un fichier dans
 * un navigateur) puis ouvre le résultat ; la scène (toucher deux fois, tenir,
 * ou Entrée au clavier) prend la photo sans l'écrire nulle part hors de l'app.
 * « Enregistrer » n'apparaît que si la prise n'est pas déjà enregistrée avec ce
 * cadre (loi `@meeshy/shared/utils/capture/capture-save`).
 */
describe('le cadre est le déclencheur (#10284)', () => {
  const live = async (overrides: Parameters<typeof env>[0] = {}) => {
    const bench = env(overrides);
    const host = await open(rank, bench.env, bench.log);
    await click(choose(host, 'selfie'));
    await settle();
    return { ...bench, host };
  };
  const fire = (target: HTMLElement | null, event: Event) => act(() => void target?.dispatchEvent(event));

  test('aucun rond d’enregistrement à côté du cadre : la case du cadre est le seul déclencheur', async () => {
    const { host } = await live();
    expect(by(host, 'data-photo-shutter')).toBeNull();
    expect(host.querySelectorAll('[data-photo-take="frame"]')).toHaveLength(1);
    expect(takeFrame(host)?.tagName).toBe('BUTTON');
  });

  test('toucher la case du cadre : la photo part dans la galerie, PUIS le résultat, sans « Enregistrer »', async () => {
    const { host, log } = await live();
    await click(takeFrame(host));
    await settle();
    expect(log.saved).toHaveLength(1);
    expect(log.saved[0]).toBe(log.outputs.at(-1)?.story);
    expect(by(host, 'data-photo-share')).not.toBeNull();
    expect(by(host, 'data-photo-save')).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Image enregistrée');
  });

  test('#10296 : story enregistrée par la case du cadre, puis le carré : « Enregistrer » revient et écrit le carré', async () => {
    const { host, log } = await live();
    await click(takeFrame(host));
    await settle();
    expect(by(host, 'data-photo-save')).toBeNull();
    await click(by(host, 'data-photo-format="square"'));
    expect(by(host, 'data-photo-save')).not.toBeNull();
    await click(by(host, 'data-photo-save'));
    await settle();
    expect(log.saved.map((f) => f.name)).toEqual(['meeshy-story.png', 'meeshy-profil.png']);
    expect(by(host, 'data-photo-save')).toBeNull();
  });

  test('#10296 : le carré enregistré puis le retour à la story déjà enregistrée : masqué, sans doublon', async () => {
    const { host, log } = await live();
    await click(takeFrame(host));
    await settle();
    await click(by(host, 'data-photo-format="square"'));
    await click(by(host, 'data-photo-save'));
    await settle();
    await click(by(host, 'data-photo-format="story"'));
    expect(by(host, 'data-photo-save')).toBeNull();
    expect(log.saved).toHaveLength(2);
  });

  test('toucher deux fois la scène : le résultat, RIEN dans la galerie, « Enregistrer » visible', async () => {
    const { host, log } = await live();
    await fire(scene(host), new MouseEvent('dblclick', { bubbles: true }));
    await settle();
    expect(by(host, 'data-photo-share')).not.toBeNull();
    expect(log.saved).toEqual([]);
    expect(by(host, 'data-photo-save')).not.toBeNull();
  });

  test('un seul toucher sur la scène ne prend rien', async () => {
    const { host, log } = await live();
    await click(scene(host));
    await settle();
    expect(log.rendered).toEqual([]);
    expect(takeFrame(host)).not.toBeNull();
  });

  test('tenir la scène prend la photo hors cadre', async () => {
    const { host, log } = await live();
    await fire(scene(host), new PointerEvent('pointerdown', { bubbles: true }));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 600)));
    await fire(scene(host), new PointerEvent('pointerup', { bubbles: true }));
    await settle();
    expect(log.rendered).toHaveLength(1);
    expect(log.saved).toEqual([]);
    expect(by(host, 'data-photo-save')).not.toBeNull();
  });

  test('un appui bref sur la scène ne déclenche pas', async () => {
    const { host, log } = await live();
    await fire(scene(host), new PointerEvent('pointerdown', { bubbles: true }));
    await fire(scene(host), new PointerEvent('pointerup', { bubbles: true }));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 600)));
    expect(log.rendered).toEqual([]);
  });

  test('au clavier, la scène est un contrôle nommé : Entrée prend la photo hors cadre', async () => {
    const { host, log } = await live();
    const target = scene(host);
    expect(target?.getAttribute('role')).toBe('button');
    expect(target?.getAttribute('tabindex')).toBe('0');
    expect(target?.getAttribute('aria-label')?.length).toBeGreaterThan(10);
    await fire(target, new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(log.rendered).toHaveLength(1);
    expect(log.saved).toEqual([]);
  });

  test('« Enregistrer » après une prise hors cadre : enregistrée une fois, puis le bouton disparaît', async () => {
    const { host, log } = await live();
    await fire(scene(host), new MouseEvent('dblclick', { bubbles: true }));
    await settle();
    await click(by(host, 'data-photo-save'));
    await settle();
    expect(log.saved).toHaveLength(1);
    expect(by(host, 'data-photo-save')).toBeNull();
  });

  test('une galerie qui refuse l’écriture automatique : on le dit, et « Enregistrer » revient', async () => {
    const { host } = await live({ save: async () => 'failed' });
    await click(takeFrame(host));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('L’enregistrement n’a pas pu aboutir');
    expect(by(host, 'data-photo-save')).not.toBeNull();
  });

  test('un « Enregistrer » qui échoue revient', async () => {
    const { host } = await live({ save: async () => 'failed' });
    await fire(scene(host), new MouseEvent('dblclick', { bubbles: true }));
    await settle();
    await click(by(host, 'data-photo-save'));
    await settle();
    expect(by(host, 'data-photo-save')).not.toBeNull();
  });

  test('une prise par le cadre déjà enregistrée ne propose plus la galerie quand le carnet est plein', async () => {
    const { host, log } = await live({ keepOutcome: 'no-space' });
    await click(takeFrame(host));
    await settle();
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Plus de place');
    expect(by(host, 'data-photo-no-space-save')).toBeNull();
    expect(log.saved).toHaveLength(1);
  });
});

/**
 * LE LIEN DE PARRAINAGE SUR LA CARTE PARTAGÉE (#7742) — le bandeau de la carte
 * porte le lien de l'utilisateur et sa Flamme, le partage redit le lien en
 * texte. Sans lien — service indisponible, hors ligne —, la carte part comme
 * avant : le parrainage n'est jamais une condition du partage.
 */
describe('le lien de parrainage accompagne la carte', () => {
  const LINK = 'https://meeshy.me/signup/affiliate/aff_abc';
  const openWith = async (overrides: Parameters<typeof env>[0], flameDays: number | null = 23) => {
    const bench = env(overrides);
    const host = await mount(<GamePhotoFlow moment={rank} env={bench.env} flameDays={flameDays} onClose={(result) => bench.log.closed.push(result)} />);
    await settle();
    return { ...bench, host };
  };
  const toShare = async (overrides: Parameters<typeof env>[0], flameDays: number | null = 23) => {
    const bench = await openWith(overrides, flameDays);
    await click(choose(bench.host, 'card'));
    await settle();
    return bench;
  };

  test('la composition reçoit le lien et la Flamme', async () => {
    const { log } = await toShare({ referral: async () => LINK });
    expect(log.referrals).toHaveLength(1);
    expect(log.referrals[0]).toEqual({ url: LINK, flameDays: 23 });
  });

  test('le partage transmet aussi le lien en texte', async () => {
    const { host, log } = await toShare({ referral: async () => LINK });
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(log.texts).toEqual([`Rejoins-moi sur Meeshy : ${LINK}`]);
  });

  test('l’aperçu de la caméra porte déjà le bandeau : on voit ce qu’on obtient', async () => {
    const { host } = await openWith({ referral: async () => LINK });
    await click(choose(host, 'selfie'));
    await settle();
    expect(host.textContent).toContain('Rejoins-moi sur Meeshy');
    expect(host.textContent).not.toContain('meeshy.me');
    const qr = host.querySelector('[data-photo-banner-qr]');
    expect(qr?.getAttribute('role')).toBe('img');
    expect(qr?.getAttribute('aria-label')).toBe('QR code de ton lien d’invitation');
    expect(qr?.closest('[aria-hidden="true"]')).toBeNull();
    expect(qr?.querySelector('path')?.getAttribute('d')).toMatch(/^M\d+ \d+h\d+/);
  });

  test('de droite à gauche, le carré QR de l’aperçu passe en fin de ligne — à gauche — et la phrase s’ancre à droite', async () => {
    await loadGameCatalog('ar');
    document.documentElement.lang = 'ar';
    try {
      const { host } = await openWith({ referral: async () => LINK });
      await click(choose(host, 'selfie'));
      await settle();
      const qr = host.querySelector<HTMLElement>('[data-photo-banner-qr]');
      expect(Number.parseFloat(qr?.style.left ?? '100')).toBeLessThan(50);
      const banner = host.querySelector('[data-photo-banner]');
      const headline = banner?.nextElementSibling as HTMLElement | null;
      expect(headline?.style.right).toMatch(/%$/);
      expect(headline?.style.textAlign).toBe('right');
    } finally {
      document.documentElement.lang = 'fr';
    }
  });

  test('sans lien (le service répond « rien »), la carte part sans bandeau et sans texte', async () => {
    const { host, log } = await toShare({ referral: async () => null });
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(log.referrals).toEqual([null]);
    expect(log.texts).toEqual([undefined]);
  });

  test('un service de lien qui échoue ne retient pas la carte', async () => {
    const { host, log } = await toShare({
      referral: async () => {
        throw new Error('réseau');
      },
    });
    expect(log.rendered).toHaveLength(1);
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(log.texts).toEqual([undefined]);
    expect(log.shared).toHaveLength(1);
  });

  test('un environnement qui ne sait pas dire le lien (ancien double) : la carte part comme avant', async () => {
    const { log } = await toShare({});
    expect(log.referrals).toEqual([null]);
  });

  test('Flamme éteinte : le lien part, sans jours', async () => {
    const { log } = await toShare({ referral: async () => LINK }, 0);
    expect(log.referrals[0]?.flameDays).toBeNull();
  });

  test('le lien est demandé UNE fois par déroulé', async () => {
    let asked = 0;
    const { host } = await openWith({
      referral: async () => {
        asked += 1;
        return LINK;
      },
    });
    await click(choose(host, 'card'));
    await settle();
    expect(asked).toBe(1);
  });
});

/**
 * CE QUE LA CARTE PORTE SE CHOISIT (conformité H-2) — le lien d'invitation et la
 * Flamme sont chacun retirables AVANT la prise ; l'aperçu du cadre montre
 * exactement ce qui sera composé, et le partage ne redit le lien en texte que
 * s'il est sur la carte.
 */
describe('le lien et la Flamme se retirent de la carte', () => {
  const LINK = 'https://meeshy.me/signup/affiliate/aff_abc';
  const open = async (flameDays: number | null = 23) => {
    const bench = env({ referral: async () => LINK });
    const host = await mount(<GamePhotoFlow moment={rank} env={bench.env} flameDays={flameDays} onClose={(result) => bench.log.closed.push(result)} />);
    await settle();
    return { ...bench, host };
  };
  const toggle = async (host: HTMLElement, attribute: string): Promise<void> => click(host.querySelector<HTMLElement>(`[${attribute}]`));

  test('deux cases, cochées : le lien et la Flamme', async () => {
    const { host } = await open();
    expect(host.querySelector<HTMLInputElement>('[data-photo-with-link]')?.checked).toBe(true);
    expect(host.querySelector<HTMLInputElement>('[data-photo-with-flame]')?.checked).toBe(true);
  });

  test('retirer la Flamme : le lien part, sans jours', async () => {
    const { host, log } = await open();
    await toggle(host, 'data-photo-with-flame');
    await click(choose(host, 'card'));
    await settle();
    expect(log.referrals[0]).toEqual({ url: LINK, flameDays: null });
  });

  test('retirer le lien : la carte part sans bandeau, sans Flamme et sans texte', async () => {
    const { host, log } = await open();
    await toggle(host, 'data-photo-with-link');
    await click(choose(host, 'card'));
    await settle();
    expect(log.referrals).toEqual([null]);
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(log.texts).toEqual([undefined]);
  });

  test('sans lien le lien est coché mais retiré : la case de la Flamme se suspend', async () => {
    const { host } = await open();
    await toggle(host, 'data-photo-with-link');
    expect(host.querySelector<HTMLInputElement>('[data-photo-with-flame]')?.disabled).toBe(true);
  });

  test('l’aperçu de la caméra suit le choix : sans lien, plus de bandeau', async () => {
    const { host } = await open();
    await toggle(host, 'data-photo-with-link');
    await click(choose(host, 'selfie'));
    await settle();
    expect(host.textContent).not.toContain('Rejoins-moi sur Meeshy');
  });

  test('Flamme éteinte (0 jour) : aucune case de Flamme, jamais une option vide', async () => {
    const { host } = await open(0);
    expect(host.querySelector('[data-photo-with-flame]')).toBeNull();
    expect(host.querySelector('[data-photo-with-link]')).not.toBeNull();
  });

  test('pas de lien du tout : aucune option à retirer', async () => {
    const bench = env({ referral: async () => null });
    const host = await mount(<GamePhotoFlow moment={rank} env={bench.env} flameDays={23} onClose={() => undefined} />);
    await settle();
    expect(host.querySelector('[data-photo-options]')).toBeNull();
  });
});

describe('le droit à l’image (conformité H-3)', () => {
  test('à l’étape de la caméra, Meo rappelle de demander l’accord des personnes photographiées', async () => {
    const bench = env({});
    const host = await mount(<GamePhotoFlow moment={rank} env={bench.env} onClose={() => undefined} />);
    await settle();
    await click(choose(host, 'selfie'));
    await settle();
    expect(host.querySelector('[data-photo-image-right]')?.textContent).toContain('demande-leur leur accord');
  });
});

/**
 * AUCUN JETON SANS GESTE (#7742, décision porteur) — ouvrir le moment photo ne
 * crée rien : l'aperçu montre le lien EXISTANT s'il y en a un, sinon
 * l'emplacement VIDE du carré QR, en pointillé (#9554). Le jeton se crée au toucher de
 * « Partager », et la carte est recomposée avec le vrai lien AVANT de partir.
 * Enregistrer et garder au carnet ne créent rien : l'image qui sort porte le
 * vrai lien ou rien, jamais l'emplacement.
 */
describe('aucun jeton de parrainage ne se crée sans geste', () => {
  const LINK = 'https://meeshy.me/signup/affiliate/aff_neuf';
  const PLACEHOLDER = { url: '', flameDays: 23, placeholder: true };
  const bench = async (created: string | null = LINK) => {
    let creations = 0;
    const made = env({
      referral: async () => null,
      createReferral: async () => {
        creations += 1;
        return created;
      },
    });
    const host = await mount(<GamePhotoFlow moment={rank} env={made.env} flameDays={23} onClose={() => undefined} />);
    await settle();
    return { ...made, host, creations: () => creations };
  };
  const toResult = async (created: string | null = LINK) => {
    const b = await bench(created);
    await click(choose(b.host, 'card'));
    await settle();
    return b;
  };

  test('ouvrir puis composer ne crée aucun jeton : la carte porte l’EMPLACEMENT, la Flamme à côté', async () => {
    const { log, creations } = await toResult();
    expect(creations()).toBe(0);
    expect(log.referrals).toEqual([PLACEHOLDER]);
  });

  test('l’emplacement se retire comme un lien : la case est offerte', async () => {
    const { host } = await bench();
    expect(host.querySelector<HTMLInputElement>('[data-photo-with-link]')?.checked).toBe(true);
  });

  test('l’aperçu de la caméra montre un carré VIDE en pointillé : aucun QR tant qu’il n’y a pas de jeton', async () => {
    const { host } = await bench();
    await click(choose(host, 'selfie'));
    await settle();
    const slot = host.querySelector('[data-photo-banner-placeholder]');
    expect(slot).not.toBeNull();
    expect(slot?.textContent).toBe('');
    expect(slot?.childElementCount).toBe(0);
    expect(host.querySelector('[data-photo-banner-qr]')).toBeNull();
    expect(host.textContent).not.toContain('meeshy.me');
  });

  test('« Partager » crée le jeton UNE fois, recompose la carte avec le vrai lien, puis la partage avec le lien en texte', async () => {
    const { host, log, creations } = await toResult();
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(creations()).toBe(1);
    expect(log.referrals).toEqual([PLACEHOLDER, { url: LINK, flameDays: 23 }]);
    expect(log.shared[0]?.file).toBe(log.outputs[1]?.story);
    expect(log.texts).toEqual([`Rejoins-moi sur Meeshy : ${LINK}`]);
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(creations()).toBe(1);
  });

  test('un jeton refusé : la carte part SANS bandeau, sans texte — jamais avec l’emplacement', async () => {
    const { host, log } = await toResult(null);
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(log.referrals).toEqual([PLACEHOLDER, null]);
    expect(log.shared[0]?.file).toBe(log.outputs[1]?.story);
    expect(log.texts).toEqual([undefined]);
  });

  test('« Enregistrer » ne crée rien, et l’image enregistrée ne porte pas l’emplacement', async () => {
    const { host, log, creations } = await toResult();
    await click(by(host, 'data-photo-save'));
    await settle();
    expect(creations()).toBe(0);
    expect(log.referrals.at(-1)).toBeNull();
    expect(log.saved[0]).toBe(log.outputs.at(-1)?.story);
  });

  test('« Garder au carnet » ne crée rien, et la photo gardée ne porte pas l’emplacement', async () => {
    const { host, log, creations } = await toResult();
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(creations()).toBe(0);
    expect(log.kept[0]?.photo.story).toBe(log.outputs.at(-1)?.story);
    expect(log.referrals.at(-1)).toBeNull();
  });

  test('lien retiré de la carte : « Partager » ne crée rien', async () => {
    const { host, creations, log } = await bench();
    await click(host.querySelector<HTMLElement>('[data-photo-with-link]'));
    await click(choose(host, 'card'));
    await settle();
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(creations()).toBe(0);
    expect(log.texts).toEqual([undefined]);
  });

  test('une lecture du lien qui arrive APRÈS la composition ne change pas ce qui part : la carte sans bandeau part sans bandeau, sans texte, sans jeton', async () => {
    let creations = 0;
    let answer: (url: string | null) => void = () => undefined;
    const made = env({
      referral: () => new Promise<string | null>((resolve) => (answer = resolve)),
      createReferral: async () => {
        creations += 1;
        return LINK;
      },
    });
    const host = await mount(<GamePhotoFlow moment={rank} env={made.env} flameDays={23} onClose={() => undefined} />);
    await click(choose(host, 'card'));
    await settle();
    expect(made.log.referrals).toEqual([null]);
    await act(async () => answer(null));
    await settle();
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(creations).toBe(0);
    expect(made.log.texts).toEqual([undefined]);
    expect(made.log.shared[0]?.file).toBe(made.log.outputs[0]?.story);
  });

  test('un lien existant : « Partager » ne crée rien de plus', async () => {
    let creations = 0;
    const made = env({
      referral: async () => LINK,
      createReferral: async () => {
        creations += 1;
        return 'https://meeshy.me/signup/affiliate/autre';
      },
    });
    const host = await mount(<GamePhotoFlow moment={rank} env={made.env} flameDays={23} onClose={() => undefined} />);
    await settle();
    await click(choose(host, 'card'));
    await settle();
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(creations).toBe(0);
    expect(made.log.texts).toEqual([`Rejoins-moi sur Meeshy : ${LINK}`]);
  });
});

/**
 * LA CARTE QUI NOMME SON AUTEUR (#10816) — la proposition montre la carte
 * posée du moment, gravée au pseudo de l'auteur ; et la plaque part dans
 * l'image (le cadre de la scène la porte, la composition la relit).
 */
describe('la carte d’auteur', () => {
  const author = { handle: 'atabeth' };
  const openWith = (moment: PhotoMoment, e: PhotoEnv, log: Log, who: { handle: string } | null) =>
    mount(<GamePhotoFlow moment={moment} env={e} author={who} onClose={(result) => log.closed.push(result)} />);

  test('la proposition pose la carte du moment, gravée au pseudo', async () => {
    const { env: e, log } = env();
    const host = await openWith(rank, e, log, author);
    const card = by(host, 'data-author-card');
    expect(card?.getAttribute('aria-label')).toContain('@atabeth');
    expect(card?.textContent).toContain('@atabeth');
    expect(choose(host, 'selfie')).not.toBeNull();
  });

  test('sans auteur (invité) : la proposition d’avant, sans carte', async () => {
    const { env: e, log } = env();
    const host = await openWith(rank, e, log, null);
    expect(by(host, 'data-author-card')).toBeNull();
    expect(host.textContent).toContain('On immortalise ?');
  });

  test('la carte seule : le cadre de la scène porte la plaque que la composition relira', async () => {
    const { env: e, log } = env({ render: async () => new Promise<PhotoFiles | null>(() => undefined) });
    const host = await openWith(rank, e, log, author);
    await click(choose(host, 'card'));
    await settle();
    expect(host.querySelector('[data-photo-stage] [data-photo-art="author"] svg')).not.toBeNull();
  });
});
