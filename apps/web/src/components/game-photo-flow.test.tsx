import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { CameraResult } from '@/lib/game-photo/camera';
import type { PhotoSource } from '@/lib/game-photo/compose';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { rankMoment, startMoment, type PhotoMoment } from '@/lib/game-photo/moments';
import type { KeptPhoto, Notebook } from '@/lib/game-photo/notebook';
import type { PhotoReferral } from '@/lib/game-photo/referral';
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
  /** Le texte qui accompagnait chaque partage (#7742). */
  texts: (string | undefined)[];
  /** Le bandeau de parrainage de chaque composition (#7742). */
  referrals: (PhotoReferral | null | undefined)[];
  saved: File[];
  rendered: { moment: PhotoMoment; mirror: boolean | null }[];
  closed: PhotoFlowResult[];
};

const files = (): PhotoFiles => ({
  story: new File(['s'], 'meeshy-story.png', { type: 'image/png' }),
  square: new File(['q'], 'meeshy-profil.png', { type: 'image/png' }),
});

function env(overrides: Partial<PhotoEnv> & { camera?: CameraResult | 'pending'; keepOk?: boolean; shareOutcome?: ShareOutcome; renderOk?: boolean } = {}) {
  const log: Log = { stops: 0, cameraOpened: 0, kept: [], deferred: [], shared: [], texts: [], referrals: [], saved: [], rendered: [], closed: [] };
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
    share: async (file, title, text) => (log.shared.push({ file, title }), log.texts.push(text), overrides.shareOutcome ?? 'shared'),
    save: async (file) => (log.saved.push(file), 'downloaded'),
    render: async ({ moment, photo, referral }) => {
      log.rendered.push({ moment, mirror: photo === null ? null : photo.mirror });
      log.referrals.push(referral);
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
  test('la caméra s’ouvre, puis le déclencheur est là, nommé', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(log.cameraOpened).toBe(1);
    expect(by(host, 'data-photo-shutter')?.textContent).toBe('Prendre la photo');
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
    await click(by(host, 'data-photo-shutter'));
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

  test('le déclencheur porte son texte visible dans son nom accessible', async () => {
    const { env: e, log } = env();
    const host = await open(rank, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    const shutter = by(host, 'data-photo-shutter');
    const name = shutter?.getAttribute('aria-label') ?? shutter?.textContent ?? '';
    expect(name).toContain(shutter?.textContent ?? '∅');
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
    expect(log.referrals[0]).toEqual({ url: LINK, display: 'meeshy.me/signup/affiliate/aff_abc', flameDays: 23 });
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
    expect(host.textContent).toContain('meeshy.me/signup/affiliate/aff_abc');
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
