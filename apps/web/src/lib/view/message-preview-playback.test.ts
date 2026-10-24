import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { armPreviewPlayback, previewPlayControls, previewTabTarget } from './message-preview-playback';

/**
 * L'APERÇU D'APPUI LONG LIT LES VOCAUX ET LES VIDÉOS (#11339, décision porteur
 * du 2026-10-24, option B) — la même règle que l'aperçu iOS, dans les trois
 * modes.
 *
 * Le clone reste une IMAGE du message : seul le bouton de lecture d'un vocal
 * ou d'une vidéo y vit encore, et il RELAIE au lecteur de la rangée vivante
 * (un seul moteur, un seul son, le rapport de consommation du fil). Tout le
 * reste du clone est inerte. Fermer le menu arrête ce que l'aperçu a lancé ;
 * une pièce protégée ne se lit jamais.
 */
beforeAll(() => ensureHappyDomRegistered());
afterAll(async () => releaseHappyDomIfRegistered());

const VOICE = (id: string) =>
  `<div data-voice-card data-attachment="${id}"><audio preload="none"></audio><div>` +
  `<button type="button" data-voice-play aria-label="Lire l’audio">▶</button>` +
  `<span role="slider" tabindex="0">~~~</span><span data-voice-time>0:12</span>` +
  `<button type="button" aria-label="Vitesse">1×</button></div></div>`;

const VIDEO = (id: string) =>
  `<div data-media-tile data-attachment="${id}"><video preload="none"></video>` +
  `<button type="button" data-video-surface aria-label="Plein écran"></button>` +
  `<button type="button" data-video-control="play-pause" aria-label="Lire la vidéo">▶</button></div>`;

const build = (html: string): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
};

/** Un `<audio>`/`<video>` de happy-dom, piloté à la main : `paused` suit `play()`/`pause()`. */
function controllable(media: HTMLMediaElement): { readonly pauses: () => number } {
  let paused = true;
  let pauses = 0;
  Object.defineProperty(media, 'paused', { configurable: true, get: () => paused });
  media.play = () => {
    paused = false;
    return Promise.resolve();
  };
  media.pause = () => {
    paused = true;
    pauses += 1;
  };
  return { pauses: () => pauses };
}

/** Une rangée VIVANTE et son clone : le bouton vivant bascule son média, comme `toggle`. */
function liveAndClone(html: string) {
  const source = build(html);
  const clone = build(html);
  const media = Array.from(source.querySelectorAll<HTMLMediaElement>('audio, video')).map((m) => ({ element: m, ...controllable(m) }));
  source.querySelectorAll<HTMLButtonElement>('[data-voice-play], [data-video-control="play-pause"]').forEach((button) => {
    const element = button.closest('[data-attachment]')!.querySelector<HTMLMediaElement>('audio, video')!;
    button.addEventListener('click', () => {
      if (element.paused) {
        void element.play();
        button.setAttribute('aria-label', 'Mettre en pause');
        button.textContent = '❚❚';
        return;
      }
      element.pause();
      button.setAttribute('aria-label', 'Lire l’audio');
      button.textContent = '▶';
    });
  });
  return { source, clone, media };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('previewPlayControls — la zone tactile de l’aperçu', () => {
  test('un vocal et une vidéo offrent chacun leur bouton de lecture, et rien d’autre', () => {
    const clone = build(VOICE('a1') + VIDEO('v1'));
    const controls = previewPlayControls(clone);
    expect(controls.map((c) => c.closest('[data-attachment]')!.getAttribute('data-attachment'))).toEqual(['a1', 'v1']);
    expect(controls.every((c) => c.matches('[data-voice-play], [data-video-control="play-pause"]'))).toBe(true);
  });

  test('un texte seul n’offre aucune zone tactile', () => {
    expect(previewPlayControls(build('<p>Bonjour</p>'))).toEqual([]);
  });

  test('une pièce sous une forme protégée (vue unique, flou, chiffré) n’offre rien', () => {
    const clone = build(`<div data-protected="hidden">${VOICE('a1')}</div><div data-protected-rest>${VIDEO('v1')}</div>`);
    expect(previewPlayControls(clone)).toEqual([]);
  });
});

describe('armPreviewPlayback — le clone relaie au lecteur vivant', () => {
  test('cliquer lecture dans l’aperçu lance la lecture du vocal, et le bouton le dit', async () => {
    const { source, clone, media } = liveAndClone(VOICE('a1'));
    armPreviewPlayback(clone, { source });
    clone.querySelector<HTMLButtonElement>('[data-voice-play]')!.click();
    await settle();
    expect(media[0]!.element.paused).toBe(false);
    expect(clone.querySelector('[data-voice-play]')!.getAttribute('aria-label')).toBe('Mettre en pause');
    expect(clone.querySelector('[data-voice-play]')!.textContent).toBe('❚❚');
  });

  test('le clic de lecture ne remonte pas jusqu’au voile (le menu reste ouvert)', () => {
    const { source, clone } = liveAndClone(VOICE('a1'));
    const reached: string[] = [];
    clone.addEventListener('click', () => reached.push('clone'));
    armPreviewPlayback(clone, { source });
    clone.querySelector<HTMLButtonElement>('[data-voice-play]')!.click();
    expect(reached).toEqual([]);
  });

  test('la vidéo se lit aussi depuis l’aperçu', async () => {
    const { source, clone, media } = liveAndClone(VIDEO('v1'));
    armPreviewPlayback(clone, { source });
    clone.querySelector<HTMLButtonElement>('[data-video-control="play-pause"]')!.click();
    await settle();
    expect(media[0]!.element.paused).toBe(false);
  });

  test('seul le bouton de lecture reste vivant : le reste du clone est inerte', () => {
    const { source, clone } = liveAndClone(VOICE('a1') + VIDEO('v1'));
    armPreviewPlayback(clone, { source });
    const play = clone.querySelector<HTMLElement>('[data-voice-play]')!;
    expect(play.closest('[inert]')).toBe(null);
    expect(play.style.pointerEvents).toBe('auto');
    expect(clone.querySelector('[role="slider"]')!.closest('[inert]')).not.toBe(null);
    expect(clone.querySelector('[aria-label="Vitesse"]')!.closest('[inert]')).not.toBe(null);
    expect(clone.querySelector('[data-video-surface]')!.closest('[inert]')).not.toBe(null);
  });

  test('fermer le menu arrête ce que l’aperçu a lancé', async () => {
    const { source, clone, media } = liveAndClone(VOICE('a1'));
    const playback = armPreviewPlayback(clone, { source })!;
    clone.querySelector<HTMLButtonElement>('[data-voice-play]')!.click();
    await settle();
    playback.dispose();
    expect(media[0]!.element.paused).toBe(true);
  });

  test('fermer ne coupe pas une lecture lancée AVANT le menu, depuis le fil', () => {
    const { source, clone, media } = liveAndClone(VOICE('a1'));
    void media[0]!.element.play();
    const playback = armPreviewPlayback(clone, { source })!;
    playback.dispose();
    expect(media[0]!.element.paused).toBe(false);
    expect(media[0]!.pauses()).toBe(0);
  });

  test('une lecture démarrée PENDANT le menu hors du clic de l’aperçu (file du fil) s’arrête aussi à la fermeture', () => {
    const { source, clone, media } = liveAndClone(VOICE('a1'));
    const playback = armPreviewPlayback(clone, { source })!;
    void media[0]!.element.play();
    media[0]!.element.dispatchEvent(new Event('play'));
    playback.dispose();
    expect(media[0]!.element.paused).toBe(true);
  });

  test('une vidéo qui JOUAIT déjà dans le fil se peint dans le clone dès l’armement', () => {
    const html = VIDEO('v1').replace('<video preload="none"></video>', '<video preload="none"></video><img data-preview-frame alt="" />');
    const { source, clone, media } = liveAndClone(html);
    const video = media[0]!.element as HTMLVideoElement;
    void video.play();
    Object.defineProperty(video, 'readyState', { configurable: true, get: () => 4 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 320 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 180 });
    const playback = armPreviewPlayback(clone, { source })!;
    expect(clone.querySelector('[data-preview-frame]')!.tagName).toBe('CANVAS');
    playback.dispose();
    expect(video.paused).toBe(false);
  });

  test('aucune pièce lisible : rien n’est armé, le clone reste une image', () => {
    const source = build('<p>Bonjour</p>');
    const clone = build('<p>Bonjour</p>');
    expect(armPreviewPlayback(clone, { source })).toBe(null);
  });

  test('vue unique : le clone ne porte que la forme au repos, rien ne se lit', () => {
    const source = build(`<div data-protected="hidden">${VOICE('a1')}</div>`);
    const clone = build(`<div data-protected="hidden">${VOICE('a1')}</div>`);
    expect(armPreviewPlayback(clone, { source })).toBe(null);
  });
});

describe('previewTabTarget — le clavier atteint le bouton de lecture', () => {
  test('Tab depuis la dernière entrée du menu mène au premier bouton de l’aperçu', () => {
    expect(previewTabTarget({ controlCount: 2, focusedControl: null, rovingIndex: 4, itemCount: 5, backwards: false })).toEqual({ kind: 'control', index: 0 });
  });

  test('Tab depuis le dernier bouton de l’aperçu boucle sur la PREMIÈRE entrée du menu', () => {
    expect(previewTabTarget({ controlCount: 2, focusedControl: 1, rovingIndex: 4, itemCount: 5, backwards: false })).toEqual({ kind: 'roving', index: 0 });
  });

  test('Maj+Tab depuis le premier bouton de l’aperçu revient à la DERNIÈRE entrée du menu', () => {
    expect(previewTabTarget({ controlCount: 2, focusedControl: 0, rovingIndex: 0, itemCount: 5, backwards: true })).toEqual({ kind: 'roving', index: 4 });
  });

  test('une dernière entrée désactivée n’empêche pas Tab d’atteindre l’aperçu', () => {
    const isDisabledAt = (index: number) => index === 4;
    expect(previewTabTarget({ controlCount: 1, focusedControl: null, rovingIndex: 3, itemCount: 5, backwards: false, isDisabledAt })).toEqual({ kind: 'control', index: 0 });
  });

  test('une première entrée désactivée : Tab hors de l’aperçu va à la première entrée ATTEIGNABLE', () => {
    const isDisabledAt = (index: number) => index === 0;
    expect(previewTabTarget({ controlCount: 1, focusedControl: 0, rovingIndex: 4, itemCount: 5, backwards: false, isDisabledAt })).toEqual({ kind: 'roving', index: 1 });
    expect(previewTabTarget({ controlCount: 1, focusedControl: null, rovingIndex: 1, itemCount: 5, backwards: true, isDisabledAt })).toEqual({ kind: 'control', index: 0 });
  });

  test('Tab entre deux boutons de l’aperçu passe au suivant', () => {
    expect(previewTabTarget({ controlCount: 2, focusedControl: 0, rovingIndex: 4, itemCount: 5, backwards: false })).toEqual({ kind: 'control', index: 1 });
  });

  test('Maj+Tab depuis la première entrée du menu mène au dernier bouton de l’aperçu', () => {
    expect(previewTabTarget({ controlCount: 2, focusedControl: null, rovingIndex: 0, itemCount: 5, backwards: true })).toEqual({ kind: 'control', index: 1 });
  });

  test('au milieu du menu, Tab reste au parcours du menu', () => {
    expect(previewTabTarget({ controlCount: 2, focusedControl: null, rovingIndex: 2, itemCount: 5, backwards: false })).toEqual({ kind: 'step' });
  });

  test('sans bouton dans l’aperçu, Tab reste au parcours du menu', () => {
    expect(previewTabTarget({ controlCount: 0, focusedControl: null, rovingIndex: 4, itemCount: 5, backwards: false })).toEqual({ kind: 'step' });
  });
});
