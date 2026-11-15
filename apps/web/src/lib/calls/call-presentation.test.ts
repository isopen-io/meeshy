import { describe, expect, test } from 'bun:test';

import { callCoversScreen, interruptPlayback, presentationModeFor } from './call-presentation';
import type { ActiveCall, CallDisplay } from './call-store';

/**
 * UN APPEL S'AFFICHE PAR-DESSUS TOUT PLEIN ÉCRAN (#8727, jumelle de #8725 —
 * `CallWindowPresenter` / `CallPlaybackInterruptionBinding` iOS). Directive
 * porteur 2026-09-29 : « qu'on soit en plein écran de story, réel ou
 * image/audio/vidéo, la vue doit s'afficher ; réduire suffit pour poursuivre ».
 */

const call = (kind: 'incoming' | 'connected', display: CallDisplay): Pick<ActiveCall, 'phase' | 'display'> => ({ phase: { kind }, display });
const ended = (display: CallDisplay): Pick<ActiveCall, 'phase' | 'display'> => ({ phase: { kind: 'ended', reason: 'local', detail: null }, display });

describe('quand l’écran d’appel COUVRE l’écran', () => {
  test('à la sonnerie, à la fin, et plein écran — jamais réduit en pastille ou en bulle', () => {
    expect(callCoversScreen(null)).toBe(false);
    expect(callCoversScreen(call('incoming', 'pill'))).toBe(true);
    expect(callCoversScreen(ended('bubble'))).toBe(true);
    expect(callCoversScreen(call('connected', 'full'))).toBe(true);
    expect(callCoversScreen(call('connected', 'pill'))).toBe(false);
    expect(callCoversScreen(call('connected', 'bubble'))).toBe(false);
  });
});

describe('où se pose la couche d’appel', () => {
  test('une feuille MODALE ouverte ⇒ la couche monte au-dessus d’elle, en modale à son tour', () => {
    expect(presentationModeFor({ covers: true, foreignModalOpen: true })).toBe('modal');
  });

  test('sans modale étrangère, ou réduite, elle reste dans la page — on navigue dessous', () => {
    expect(presentationModeFor({ covers: true, foreignModalOpen: false })).toBe('inline');
    expect(presentationModeFor({ covers: false, foreignModalOpen: true })).toBe('inline');
  });
});

describe('la lecture en cours s’interrompt', () => {
  const media = (paused: boolean) => {
    const state = { paused, pauses: 0 };
    return {
      state,
      element: {
        get paused() {
          return state.paused;
        },
        pause() {
          state.paused = true;
          state.pauses += 1;
        },
      },
    };
  };

  test('ce qui joue HORS de la couche d’appel se met en pause ; le son de l’appel continue', () => {
    const story = media(false);
    const idle = media(true);
    const callAudio = media(false);
    const paused = interruptPlayback([story.element, idle.element, callAudio.element], (element) => element === callAudio.element);
    expect(paused).toBe(1);
    expect(story.state.pauses).toBe(1);
    expect(idle.state.pauses).toBe(0);
    expect(callAudio.state.paused).toBe(false);
  });
});
