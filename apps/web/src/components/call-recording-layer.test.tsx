import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CallRecordingState } from '@/lib/calls/call-recording';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallRecordingCatalog } from '@/lib/i18n-call-recording-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallRecordingPanel } from './call-recording-layer';

/**
 * CE QUE CHACUN VOIT PENDANT UN ENREGISTREMENT D'APPEL (#8064) — la question
 * posée à ceux qui doivent consentir, l'attente, l'indicateur PERSISTANT
 * « Enregistrement en cours » (chez tous, pas seulement chez l'enregistreur),
 * et le mot de la fin. Cibles de 44 px, libellés lisibles au lecteur d'écran.
 */

const noop = () => undefined;

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

describe('le panneau d’enregistrement d’appel (#8064)', () => {
  test('celui qui doit consentir voit qui demande, et deux réponses de 44 px', () => {
    const html = render(pending(false, true));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('Nadia veut enregistrer l’appel');
    expect(html).toContain('data-call-recording-answer="accept"');
    expect(html).toContain('data-call-recording-answer="refuse"');
    expect(html.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(2);
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
        const top = 60 + Number(/([\d.]+)px\)$/.exec(this.style.top)?.[1] ?? 0);
        return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) };
      },
    });
    return () => (real === undefined ? Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect') : Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', real));
  }

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
