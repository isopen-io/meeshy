import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { NowPlayingTags } from './now-playing';
import { holdWhileAudioPlays, shellPlaybackHold, type NowPlayingState, type PlaybackHold } from './shell-playback';

/**
 * **LA CARTE DE LECTURE DE LA COQUE DIT CE QUI JOUE, ET SE PILOTE** (#10624)
 * — la page reste le SEUL moteur : elle remet à la coque les faits du vocal
 * (auteur, conversation, date, avatar), sa durée et sa position, aux SEULES
 * ruptures (lecture, pause, saut, vitesse, durée connue) — jamais à chaque
 * `timeupdate` : la coque extrapole. Et la barre de la notification, glissée,
 * déplace la lecture de la page.
 */

beforeAll(() => {
  ensureHappyDomRegistered();
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const TAGS: NowPlayingTags = {
  sender: 'Nour',
  conversation: 'Famille',
  sentAtMs: 1_760_434_200_000,
  artworkUrl: 'https://gate.test/a/nour.jpg',
  protected: false,
};

function priseQuiRetient(): PlaybackHold & { readonly etats: NowPlayingState[]; readonly demanderSaut: (positionMs: number) => void } {
  const etats: NowPlayingState[] = [];
  const sauts = new Set<(positionMs: number) => void>();
  return {
    etats,
    hold: () => {},
    release: () => {},
    park: () => {},
    update: (state) => etats.push(state),
    onPauseRequested: () => () => {},
    onPlayRequested: () => () => {},
    onSeekRequested: (ecouteur) => {
      sauts.add(ecouteur);
      return () => {
        sauts.delete(ecouteur);
      };
    },
    demanderSaut: (positionMs) => {
      for (const ecouteur of sauts) ecouteur(positionMs);
    },
  };
}

function vocal(attachmentId: string | null, params: { readonly duration?: number; readonly currentTime?: number } = {}): HTMLAudioElement {
  const element = document.createElement('audio');
  if (attachmentId !== null) element.dataset.npAttachment = attachmentId;
  Object.defineProperty(element, 'duration', { value: params.duration ?? 42, configurable: true, writable: true });
  Object.defineProperty(element, 'currentTime', { value: params.currentTime ?? 0, configurable: true, writable: true });
  Object.defineProperty(element, 'paused', { value: false, configurable: true, writable: true });
  Object.defineProperty(element, 'readyState', { value: 4, configurable: true, writable: true });
  document.body.appendChild(element);
  return element;
}

const signal = (element: HTMLMediaElement, type: string): void => {
  element.dispatchEvent(new Event(type));
};

const attendre = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

describe('la page remet à la coque ce qui joue (#10624)', () => {
  test('à la lecture : les faits du vocal, sa durée, sa position, sa vitesse', () => {
    const prise = priseQuiRetient();
    const arreter = holdWhileAudioPlays(document, prise, { tagsOf: (id) => (id === 'att-1' ? TAGS : null), settleMs: 0 });
    const audio = vocal('att-1', { duration: 42.5, currentTime: 3.2 });
    audio.playbackRate = 1.5;
    signal(audio, 'playing');
    expect(prise.etats).toEqual([
      { key: 'att-1', ...TAGS, durationMs: 42_500, positionMs: 3_200, rate: 1.5, playing: true, buffering: false, canNext: false, canPrevious: false },
    ]);
    arreter();
    audio.remove();
  });

  test('un audio sans étiquettes part avec ses seuls faits de lecture : la coque garde ses libellés', () => {
    const prise = priseQuiRetient();
    const arreter = holdWhileAudioPlays(document, prise, { tagsOf: () => null, settleMs: 0 });
    const audio = vocal(null, { duration: Number.NaN });
    signal(audio, 'playing');
    expect(prise.etats[0]).toMatchObject({ sender: null, conversation: null, artworkUrl: null, protected: false, durationMs: 0, playing: true });
    arreter();
    audio.remove();
  });

  test('la pause remet la position et l’arrêt de la lecture ; un timeupdate ne remet RIEN', async () => {
    const prise = priseQuiRetient();
    const arreter = holdWhileAudioPlays(document, prise, { tagsOf: () => TAGS, settleMs: 0 });
    const audio = vocal('att-2');
    signal(audio, 'playing');
    audio.currentTime = 9;
    signal(audio, 'timeupdate');
    await attendre();
    expect(prise.etats).toHaveLength(1);
    Object.defineProperty(audio, 'paused', { value: true });
    signal(audio, 'pause');
    expect(prise.etats.at(-1)).toMatchObject({ positionMs: 9_000, playing: false });
    arreter();
    audio.remove();
  });

  test('un saut, un changement de vitesse ou une durée connue sont remis, regroupés', async () => {
    const prise = priseQuiRetient();
    const arreter = holdWhileAudioPlays(document, prise, { tagsOf: () => TAGS, settleMs: 0 });
    const audio = vocal('att-3');
    signal(audio, 'playing');
    audio.currentTime = 20;
    signal(audio, 'seeked');
    audio.playbackRate = 2;
    signal(audio, 'ratechange');
    await attendre();
    expect(prise.etats).toHaveLength(2);
    expect(prise.etats.at(-1)).toMatchObject({ positionMs: 20_000, rate: 2, playing: true });
    arreter();
    audio.remove();
  });

  test('un audio qui attend le réseau le dit, et sa reprise est remise : la barre de la coque ne court pas devant le son', async () => {
    const prise = priseQuiRetient();
    const arreter = holdWhileAudioPlays(document, prise, { tagsOf: () => TAGS, settleMs: 0 });
    const audio = vocal('att-6');
    signal(audio, 'playing');
    audio.currentTime = 8;
    Object.defineProperty(audio, 'readyState', { value: 2 });
    signal(audio, 'waiting');
    await attendre();
    expect(prise.etats.at(-1)).toMatchObject({ positionMs: 8_000, playing: true, buffering: true });
    audio.currentTime = 8.1;
    Object.defineProperty(audio, 'readyState', { value: 4 });
    signal(audio, 'playing');
    expect(prise.etats.at(-1)).toMatchObject({ positionMs: 8_100, playing: true, buffering: false });
    arreter();
    audio.remove();
  });

  test('glisser la barre de la notification déplace la lecture de la page', () => {
    const prise = priseQuiRetient();
    const arreter = holdWhileAudioPlays(document, prise, { tagsOf: () => TAGS, settleMs: 0 });
    const audio = vocal('att-4');
    signal(audio, 'playing');
    prise.demanderSaut(15_500);
    expect(audio.currentTime).toBe(15.5);
    arreter();
    prise.demanderSaut(1_000);
    expect(audio.currentTime).toBe(15.5);
    audio.remove();
  });

  test('un saut demandé sans rien qui joue ne touche aucun audio', () => {
    const prise = priseQuiRetient();
    const arreter = holdWhileAudioPlays(document, prise, { tagsOf: () => TAGS, settleMs: 0 });
    const audio = vocal('att-5', { currentTime: 4 });
    prise.demanderSaut(30_000);
    expect(audio.currentTime).toBe(4);
    arreter();
    audio.remove();
  });
});

type Appel = { readonly methode: string; readonly options: object };

function coque(methodes: readonly string[]): CoqueNative & { readonly appels: Appel[]; readonly emettre: (evenement: string, donnees: unknown) => void } {
  const appels: Appel[] = [];
  const ecoutes: { readonly evenement: string; readonly rappel: (donnees: unknown) => void }[] = [];
  return {
    appels,
    emettre: (evenement, donnees) => {
      for (const ecoute of ecoutes) if (ecoute.evenement === evenement) ecoute.rappel(donnees);
    },
    PluginHeaders: [{ name: 'MeeshyPlayback', methods: methodes.map((name) => ({ name })) }],
    nativePromise: (_plugin, methode, options) => {
      appels.push({ methode, options });
      return Promise.resolve({});
    },
    addListener: (_plugin, evenement, rappel) => {
      ecoutes.push({ evenement, rappel });
      return { remove: async () => {} };
    },
  };
}

describe('le pont vers la coque (#10624)', () => {
  const etat: NowPlayingState = {
    key: 'att-1',
    ...TAGS,
    durationMs: 42_000,
    positionMs: 1_000,
    rate: 1,
    playing: true,
    buffering: false,
    canNext: false,
    canPrevious: false,
  };

  test('une coque qui sait décrire la lecture la reçoit, champs absents omis', () => {
    const hote = coque(['holdPlayback', 'releasePlayback', 'nowPlaying']);
    shellPlaybackHold(hote).update({ ...etat, artworkUrl: null });
    expect(hote.appels).toHaveLength(1);
    expect(hote.appels[0]?.methode).toBe('nowPlaying');
    expect('artworkUrl' in (hote.appels[0]?.options ?? {})).toBe(false);
    expect(hote.appels[0]?.options).toMatchObject({ key: 'att-1', sender: 'Nour', durationMs: 42_000, playing: true });
  });

  test('une coque construite avant ne reçoit rien, et rien ne casse', () => {
    const hote = coque(['holdPlayback', 'releasePlayback']);
    expect(() => shellPlaybackHold(hote).update(etat)).not.toThrow();
    expect(() => shellPlaybackHold(undefined).update(etat)).not.toThrow();
    expect(hote.appels).toEqual([]);
  });

  test('la coque demande un saut : la page reçoit la position visée, et seulement un nombre', () => {
    const hote = coque(['holdPlayback', 'releasePlayback', 'nowPlaying']);
    const sauts: number[] = [];
    shellPlaybackHold(hote).onSeekRequested((positionMs) => sauts.push(positionMs));
    hote.emettre('seekRequested', { positionMs: 12_000 });
    hote.emettre('seekRequested', { positionMs: 'douze' });
    hote.emettre('seekRequested', null);
    expect(sauts).toEqual([12_000]);
  });
});
