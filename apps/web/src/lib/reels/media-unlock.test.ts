import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createReelMediaUnlocker } from './media-unlock';

/**
 * LE GESTE DÉVERROUILLE LES RÉELS VOISINS (iOS) — WebKit n'autorise la lecture
 * sonore, et un préchargement au-delà des métadonnées, qu'à un élément qui a
 * reçu un `play()` PENDANT un geste. Un balayage n'en est pas un pour le réel
 * suivant, qui n'a jamais été touché : son `play()` sonore était refusé. Le
 * doigt qui se lève (`touchend`, un geste au sens du navigateur) bénit donc,
 * une fois chacun, les voisins montés et en pause.
 */
beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

type Log = string[];

function reel(mode: string, id: string, log: Log, { playing = false }: { readonly playing?: boolean } = {}): HTMLElement {
  const article = window.document.createElement('article');
  article.setAttribute('data-reel-mode', mode);
  const video = window.document.createElement('video');
  video.setAttribute('data-reel-media', 'video');
  Object.defineProperty(video, 'paused', { get: () => !playing, configurable: true });
  video.play = () => {
    log.push(`play:${id}${video.muted ? ':muted' : ''}`);
    return Promise.reject(new DOMException('interrompu', 'AbortError'));
  };
  video.pause = () => {
    log.push(`pause:${id}`);
  };
  article.appendChild(video);
  return article;
}

describe('createReelMediaUnlocker — un geste, chaque voisin béni une fois', () => {
  test('les voisins montés (N±1, N±2) et en pause reçoivent play() puis pause(), dans le geste', () => {
    const log: Log = [];
    const pager = window.document.createElement('div');
    pager.append(reel('near', 'b', log), reel('warm', 'c', log));
    createReelMediaUnlocker().unlock(pager);
    expect(log).toEqual(['play:b:muted', 'pause:b', 'play:c:muted', 'pause:c']);
  });

  test('la bénédiction est MUETTE (iOS met en pause toute vidéo sonore quand une autre démarre), puis le son est rendu', () => {
    const log: Log = [];
    const pager = window.document.createElement('div');
    const article = reel('near', 'b', log);
    const video = article.querySelector('video')!;
    video.muted = false;
    pager.append(article);
    createReelMediaUnlocker().unlock(pager);
    expect(log[0]).toBe('play:b:muted');
    expect(video.muted).toBe(false);
  });

  test('le réel visible n’est jamais touché, ni un réel hors fenêtre', () => {
    const log: Log = [];
    const pager = window.document.createElement('div');
    pager.append(reel('active', 'a', log, { playing: true }), reel('far', 'z', log));
    createReelMediaUnlocker().unlock(pager);
    expect(log).toEqual([]);
  });

  test('un élément déjà béni ne l’est pas deux fois', () => {
    const log: Log = [];
    const pager = window.document.createElement('div');
    pager.append(reel('near', 'b', log));
    const unlocker = createReelMediaUnlocker();
    unlocker.unlock(pager);
    unlocker.unlock(pager);
    expect(log).toEqual(['play:b:muted', 'pause:b']);
  });

  test('un voisin qui joue déjà (préparation en cours) n’est pas interrompu', () => {
    const log: Log = [];
    const pager = window.document.createElement('div');
    pager.append(reel('near', 'b', log, { playing: true }));
    createReelMediaUnlocker().unlock(pager);
    expect(log).toEqual([]);
  });
});
