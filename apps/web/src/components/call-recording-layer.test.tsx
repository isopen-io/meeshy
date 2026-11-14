import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CallRecordingState } from '@/lib/calls/call-recording';
import { callChromeStore } from '@/lib/calls/call-chrome-store';
import { callRecordingStore } from '@/lib/calls/call-recording-store';
import { callStore, type ActiveCall, type CallMember } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallRecordingCatalog } from '@/lib/i18n-call-recording-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import CallRecordingLayer, { CallRecordingPanel } from './call-recording-layer';

/**
 * CE QUE CHACUN VOIT PENDANT UN ENREGISTREMENT D'APPEL (#8064) — la question
 * posée à ceux qui doivent consentir, l'attente, l'indicateur PERSISTANT
 * « Enregistrement en cours » (chez tous, pas seulement chez l'enregistreur),
 * et le mot de la fin. Cibles de 44 px, libellés lisibles au lecteur d'écran.
 */

const noop = () => undefined;

function recordAnimations() {
  const played: { readonly element: Element; readonly frames: Keyframe[] }[] = [];
  const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[]) {
      played.push({ element: this, frames });
      return { finished: new Promise(() => undefined), cancel: () => undefined, effect: null };
    },
  });
  return { played, restore: () => (real === undefined ? Reflect.deleteProperty(HTMLElement.prototype, 'animate') : Object.defineProperty(HTMLElement.prototype, 'animate', real)) };
}

beforeAll(async () => {
  await loadCallRecordingCatalog('fr');
});

const render = (state: CallRecordingState, requesterName = 'Nadia', stowed = false) =>
  renderToStaticMarkup(
    <CallRecordingPanel state={state} requesterName={requesterName} language="fr" onAnswer={noop} onStop={noop} onDismiss={noop} stowed={stowed} />,
  );

const pending = (mine: boolean, mustAnswer: boolean): CallRecordingState => ({
  view: { kind: 'pending', callId: 'call-1', recordingKind: 'audio', recordingId: 'rec-1', requesterId: mine ? 'u-me' : 'u-peer', mine, mustAnswer },
  notice: null,
});

describe('colonne du journal ouverte (W1.4, W1.21)', () => {
  const placed = (reserveEnd: number, state: CallRecordingState) =>
    renderToStaticMarkup(<CallRecordingPanel state={state} requesterName="Nadia" language="fr" onAnswer={noop} onStop={noop} onDismiss={noop} reserveEnd={reserveEnd} />);

  test('la carte d’accord et la capsule se centrent sur la scène que la colonne laisse, pas sur la fenêtre', () => {
    const column = 380;
    expect(placed(column, pending(false, true))).toContain(`inset-inline-end:calc(0.75rem + ${column}px)`);
    expect(placed(column, { view: { kind: 'recording', callId: 'call-1', recordingKind: 'audio', recordingId: 'rec-1', recorderId: 'u-peer', mine: false }, notice: null })).toContain(`inset-inline-end:${column}px`);
  });

  test('sans colonne, rien ne change', () => {
    expect(placed(0, pending(false, true))).not.toContain('inset-inline-end');
  });
});

describe('le panneau d’enregistrement d’appel (#8064)', () => {
  test('celui qui doit consentir voit qui demande, et deux réponses de 44 px', () => {
    const html = render(pending(false, true));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('Nadia veut enregistrer l’appel');
    expect(html).toContain('data-call-recording-answer="accept"');
    expect(html).toContain('data-call-recording-answer="refuse"');
    expect(html.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('pendant l’enregistrement le bouton dit « Arrêter » ; pendant l’attente, « Annuler » (R3.3)', () => {
    const recording = render({ view: { kind: 'recording', callId: 'call-1', recordingKind: 'audio', recordingId: 'rec-1', recorderId: 'u-peer', mine: false }, notice: null });
    expect(recording).toMatch(/data-call-recording-stop=""[^>]*>Arrêter<\/button>/);
    expect(recording).toContain('aria-label="Arrêter l’enregistrement"');
    expect(render(pending(true, false))).toMatch(/data-call-recording-stop=""[^>]*>Annuler<\/button>/);
  });

  test('une demande VIDÉO le dit dans la question : chacun consent en le sachant (#8437)', () => {
    const state = pending(false, true);
    const html = render({ ...state, view: { ...state.view, recordingKind: 'video' } as CallRecordingState['view'] });
    expect(html).toContain('Nadia veut enregistrer l’appel en vidéo');
  });

  test('le demandeur attend l’accord, et peut renoncer', () => {
    const html = render(pending(true, false));
    expect(html).toContain('En attente de l’accord de tous…');
    expect(html).toContain('data-call-recording-stop');
    expect(html).not.toContain('role="alertdialog"');
  });

  test('pendant l’enregistrement, l’indicateur est posé chez TOUS, avec « Arrêter »', () => {
    const theirs = render({ view: { kind: 'recording', callId: 'call-1', recordingKind: 'audio', recordingId: 'rec-1', recorderId: 'u-peer', mine: false }, notice: null });
    expect(theirs).toContain('role="status"');
    expect(theirs).toContain('Enregistrement en cours');
    expect(theirs).toContain('aria-label="Arrêter l’enregistrement"');
  });

  test('le mot de la fin dit pourquoi l’enregistrement s’est arrêté', () => {
    expect(render({ view: { kind: 'idle' }, notice: { kind: 'stopped', reason: 'refused', wasRecording: false } })).toContain('Enregistrement refusé');
    expect(render({ view: { kind: 'idle' }, notice: { kind: 'stopped', reason: 'participant-joined', wasRecording: true } })).toContain('Quelqu’un a rejoint l’appel');
    expect(render({ view: { kind: 'idle' }, notice: { kind: 'saved' } })).toContain('ajouté à la conversation');
    expect(render({ view: { kind: 'idle' }, notice: { kind: 'unavailable', code: 'NO_PEER_TO_CONSENT' } })).toContain('impossible');
  });

  test('au repos et sans mot, rien n’est rendu', () => {
    expect(render({ view: { kind: 'idle' }, notice: null })).toBe('');
  });
});

/**
 * G1.1 (#17536) — le premier toucher range tout l'appel, enregistrement compris : l'indicateur
 * « Enregistrement en cours » et son bouton Arrêter repartent vers le haut avec l'en-tête, et
 * reviennent avec lui. Seule la carte d'accord, qui attend une réponse, ne se cache jamais (G1.6).
 */
describe('un toucher qui range tout range aussi l’indicateur d’enregistrement (G1.1)', () => {
  const recording: CallRecordingState = { view: { kind: 'recording', callId: 'call-1', recordingKind: 'audio', recordingId: 'rec-1', recorderId: 'u-peer', mine: false }, notice: null };

  test('commandes visibles, l’indicateur est là, à sa place, atteignable', () => {
    const html = render(recording);
    expect(html).toContain('data-call-recording-indicator="recording"');
    expect(html).toContain('data-call-stow="top"');
    expect(html).not.toContain('data-call-stowed');
  });

  test('commandes rangées, l’indicateur est rangé vers le haut — c’est la même règle que l’en-tête', () => {
    expect(render(recording, 'Nadia', true)).toContain('data-call-stowed=""');
    expect(render(pending(true, false), 'Nadia', true)).toContain('data-call-stowed=""');
  });

  test('la carte d’accord ne se range JAMAIS : elle attend une réponse (G1.6)', () => {
    const html = render(pending(false, true), 'Nadia', true);
    expect(html).toContain('role="alertdialog"');
    expect(html).not.toContain('data-call-stowed');
  });
});

/**
 * LA PLACE DE L'INDICATEUR SUIT LA PILE EN MOUVEMENT (S2.6, #17774) — l'indicateur flotte au-dessus de l'écran
 * d'appel, à la place que la pile lui garde sous le bandeau de partage. Quand ce bandeau repart (ou arrive), sa case
 * remonte en translation : l'indicateur la suit de la même façon, au lieu de sauter de 60 px d'un coup.
 */
describe('l’indicateur d’enregistrement suit sa case quand la pile se referme (S2.6)', () => {
  const recording: CallRecordingState = { view: { kind: 'recording', callId: 'call-1', recordingKind: 'audio', recordingId: 'rec-1', recorderId: 'u-peer', mine: false }, notice: null };
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(async () => {
    await loadPillMotion();
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  /** La place de l'indicateur à l'écran : l'en-tête, plus ce que la pile pose avant lui (le décalage inscrit dans son `top`). */
  function layOut() {
    const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: HTMLElement) {
        const host = this.closest<HTMLElement>('[data-call-recording-layer]');
        const top = 60 + Number(/([\d.]+)px\)$/.exec(host?.style.top ?? '')?.[1] ?? 0);
        return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) };
      },
    });
    return () => (real === undefined ? Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect') : Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', real));
  }

  const mountAt = async (offset: number) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const renderAt = (next: number) =>
      act(async () => {
        root.render(<CallRecordingPanel state={recording} requesterName="Nadia" language="fr" onAnswer={noop} onStop={noop} onDismiss={noop} offset={next} />);
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
    await renderAt(offset);
    return {
      indicator: () => host.querySelector('[data-call-recording-indicator]'),
      renderAt,
      done: async () => {
        await act(async () => root.unmount());
        host.remove();
      },
    };
  };

  test('le bandeau de partage repart : l’indicateur remonte de ses 60 px en translation, sans sauter', async () => {
    const motion = recordAnimations();
    const unlay = layOut();
    const view = await mountAt(60);
    motion.played.length = 0;
    await view.renderAt(0);
    expect(motion.played.find((move) => move.element === view.indicator())?.frames).toEqual([{ transform: 'translateY(60px)' }, { transform: 'none' }]);
    await view.done();
    unlay();
    motion.restore();
  });

  test('le bandeau arrive : l’indicateur descend de même ; sans changement de place, rien ne bouge', async () => {
    const motion = recordAnimations();
    const unlay = layOut();
    const view = await mountAt(0);
    expect(motion.played.filter((move) => move.element === view.indicator())).toEqual([]);
    await view.renderAt(60);
    expect(motion.played.find((move) => move.element === view.indicator())?.frames).toEqual([{ transform: 'translateY(-60px)' }, { transform: 'none' }]);
    await view.done();
    unlay();
    motion.restore();
  });
});

/**
 * LA CARTE D'ACCORD ET LA CAPSULE, EN VERRE, EN MOUVEMENT (R2.2, R2.10, R2.11, R3.11, R3.12) — la planche :
 * la question sur une rangée avec le point rouge, deux moitiés égales (Refuser en verre au début, Accepter
 * en blanc plein à la fin), rien d'autre ; les trois bandeaux prennent le verre partagé, entrent par le haut
 * et repartent vers le haut.
 */
describe('la carte d’accord et la capsule de l’enregistrement', () => {
  const recording: CallRecordingState = { view: { kind: 'recording', callId: 'call-1', recordingKind: 'audio', recordingId: 'rec-1', recorderId: 'u-peer', mine: false }, notice: null };
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  test('la carte : le point rouge et la question sur une rangée, puis Refuser et Accepter en deux moitiés égales, sans 3e ligne (R2.2)', () => {
    const html = render(pending(false, true));
    expect(html).not.toContain('seulement si tout le monde accepte');
    expect(html.match(/<p /g)).toHaveLength(1);
    expect(html.indexOf('style="background:var(--ios-error-strong)')).toBeLessThan(html.indexOf('<p '));
    expect(html.indexOf('data-call-recording-answer="refuse"')).toBeLessThan(html.indexOf('data-call-recording-answer="accept"'));
    const buttons = html.match(/<button[^>]*data-call-recording-answer[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toContain('flex-1');
    expect(html).not.toContain('justify-end');
  });

  test('Refuser est un verre, Accepter un blanc plein à l’encre sombre — pas le vert du succès (R2.2)', () => {
    const html = render(pending(false, true));
    expect(html).toMatch(/class="glass-call-disc [^"]*"[^>]*data-call-recording-answer="refuse"/);
    expect(html).toMatch(/data-call-recording-answer="accept"/);
    const accept = /<button[^>]*data-call-recording-answer="accept"[^>]*>/.exec(html)?.[0] ?? '';
    expect(accept).toContain('background:var(--color-on-media)');
    expect(accept).not.toContain('--ios-success');
  });

  test('les trois bandeaux prennent le verre partagé du kit : aucun aplat peint à la main (R2.11, R3.12)', () => {
    const bands = [render(pending(false, true)), render(recording), render({ view: { kind: 'idle' }, notice: { kind: 'saved' } })];
    for (const html of bands) {
      expect(html).toContain('data-glass-tone="deep"');
      expect(html).toContain('data-glass-density="dense"');
      expect(html).not.toContain('color-mix');
      expect(html).not.toContain('shadow-lg');
    }
  });

  test('la capsule porte le même élément de l’attente à l’enregistrement : seuls les mots changent', () => {
    const waiting = render(pending(true, false));
    const live = render(recording);
    expect(waiting).toContain('data-call-recording-indicator="waiting"');
    expect(live).toContain('data-call-recording-indicator="recording"');
    expect(waiting.replace(/waiting|En attente de l’accord de tous…|Annuler|aria-label="Annuler"/g, '')).toContain('data-call-stow="top"');
  });

  describe('en mouvement', () => {
    beforeAll(async () => {
      await loadPillMotion();
      ensureHappyDomRegistered();
      globals.IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterAll(async () => {
      delete globals.IS_REACT_ACT_ENVIRONMENT;
      await releaseHappyDomIfRegistered();
    });

    const mount = async (first: CallRecordingState) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      const renderState = (state: CallRecordingState, stowed = false) =>
        act(async () => {
          root.render(<CallRecordingPanel state={state} requesterName="Nadia" language="fr" onAnswer={noop} onStop={noop} onDismiss={noop} stowed={stowed} />);
          await new Promise((resolve) => setTimeout(resolve, 30));
        });
      await renderState(first);
      return {
        host,
        renderState,
        layer: (name: string) => host.querySelector<HTMLElement>(`[data-call-recording-layer="${name}"]`),
        done: async () => {
          await act(async () => root.unmount());
          host.remove();
        },
      };
    };

    const idle: CallRecordingState = { view: { kind: 'idle' }, notice: null };

    test('la carte arrive du haut en fondu ; la réponse donnée, elle repart vers le haut pendant que la capsule arrive (R2.10, R3.11)', async () => {
      const motion = recordAnimations();
      const view = await mount(idle);
      motion.played.length = 0;
      await view.renderState(pending(false, true));
      const card = view.layer('ask');
      expect(motion.played.find((move) => move.element === card)?.frames).toEqual([
        { opacity: 0, transform: 'translateY(-100%)' },
        { opacity: 1, transform: 'translateY(0)' },
      ]);
      motion.played.length = 0;
      await view.renderState(recording);
      expect(card?.hasAttribute('data-leaving')).toBe(true);
      expect(card?.hasAttribute('inert')).toBe(true);
      expect(motion.played.find((move) => move.element === card)?.frames).toEqual([
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-100%)' },
      ]);
      expect(motion.played.find((move) => move.element === view.layer('status'))?.frames).toEqual([
        { opacity: 0, transform: 'translateY(-100%)' },
        { opacity: 1, transform: 'translateY(0)' },
      ]);
      await view.done();
      motion.restore();
    });

    test('l’avis arrive et repart par le haut lui aussi ; le premier rendu ne joue rien', async () => {
      const motion = recordAnimations();
      const view = await mount({ view: { kind: 'idle' }, notice: { kind: 'saved' } });
      expect(motion.played).toEqual([]);
      await view.renderState(idle);
      expect(view.layer('notice')?.hasAttribute('data-leaving')).toBe(true);
      expect(motion.played.find((move) => move.element === view.layer('notice'))?.frames).toEqual([
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-100%)' },
      ]);
      await view.done();
      motion.restore();
    });

    test('la carte publie sa hauteur mesurée à la pile (R2.1) et la rend quand elle repart', async () => {
      const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 132 });
      const view = await mount(pending(false, true));
      expect(callChromeStore.getState().recordingCard).toBe(132);
      await view.renderState(recording);
      expect(callChromeStore.getState().recordingCard).toBe(0);
      await view.done();
      if (real === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight');
      else Object.defineProperty(HTMLElement.prototype, 'offsetHeight', real);
    });
  });
});

/**
 * EN GROUPE, LA CARTE NOMME CELUI QUI DEMANDE (#8064, R2.2) — la question porte le nom du membre dont
 * l'identifiant est `requesterId`, jamais celui du premier membre de l'appel ni du titre de la conversation.
 */
describe('la carte d’accord nomme le demandeur, en groupe', () => {
  const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });
  const group: ActiveCall = {
    callId: 'call-1',
    conversationId: 'c-1',
    media: 'audio',
    direction: 'incoming',
    isGroup: true,
    title: 'Équipe',
    avatar: null,
    callerName: 'Amina',
    phase: { kind: 'connected' },
    connectedAt: 0,
    endedDurationSec: null,
    micMuted: false,
    cameraOn: false,
    facing: 'user',
    screenSharing: false,
    members: { 'u-a': member('u-a', 'Amina'), 'u-b': member('u-b', 'Bintou'), 'u-c': member('u-c', 'Chloé') },
    display: 'full',
    localStream: null,
    remoteStreams: {},
    captions: [],
    captionsMode: 'off',
    captionPeers: [],
    preview: null,
    previewed: false,
    transcription: 'idle',
    initiatorId: 'u-a',
    invitedBy: null,
    quality: null,
  };

  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const asks = (requesterId: string): string => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      callStore.setState({ call: group });
      callRecordingStore.setState({ view: { kind: 'pending', callId: 'call-1', recordingKind: 'audio', recordingId: 'rec-1', requesterId, mine: false, mustAnswer: true }, notice: null });
      root.render(<CallRecordingLayer />);
    });
    const question = host.querySelector('[data-call-recording-ask]')?.getAttribute('aria-label') ?? '';
    act(() => {
      root.unmount();
      callRecordingStore.setState({ view: { kind: 'idle' }, notice: null });
      callStore.setState({ call: null });
    });
    host.remove();
    return question;
  };

  test('Bintou demande : la carte dit « Bintou veut enregistrer l’appel » ; un inconnu de l’appel reste « Un participant »', () => {
    expect(asks('u-b')).toBe('Bintou veut enregistrer l’appel');
    expect(asks('u-gone')).toBe('Un participant veut enregistrer l’appel');
  });
});
