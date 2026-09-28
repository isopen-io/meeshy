import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CallRecordingState } from '@/lib/calls/call-recording';
import { loadCallRecordingCatalog } from '@/lib/i18n-call-recording-catalog';

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

const render = (state: CallRecordingState, requesterName = 'Nadia') =>
  renderToStaticMarkup(
    <CallRecordingPanel state={state} requesterName={requesterName} language="fr" onAnswer={noop} onStop={noop} onDismiss={noop} />,
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
