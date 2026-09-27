import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import type { CallRecordingNotice, CallRecordingState } from '@/lib/calls/call-recording';
import { callRecording, callRecordingStore } from '@/lib/calls/call-recording-live';
import { callStore } from '@/lib/calls/call-store';
import { translateCallRecording as translate } from '@/lib/i18n-call-recording-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE CHACUN VOIT D'UN ENREGISTREMENT D'APPEL** (#8064) — chunk à part,
 * monté par `call-layer.tsx` seulement quand une demande, un enregistrement ou
 * un mot de fin existe. La question à ceux qui doivent consentir, l'attente
 * du demandeur, l'indicateur PERSISTANT posé chez tous tant que ça enregistre
 * (chacun peut l'arrêter : retirer son accord), et le mot qui dit pourquoi
 * ça s'est arrêté. Au-dessus de l'écran d'appel comme de sa pastille.
 */

const PILL_BG = 'rgba(17,16,24,0.92)';
const RECORD_RED = '#ef4444';
const ACCEPT = '#22c55e';
const NOTICE_MS = 4_000;

type NoticeKey =
  | 'callRecording.saved'
  | 'callRecording.saveFailed'
  | 'callRecording.unavailable'
  | 'callRecording.stopped.refused'
  | 'callRecording.stopped.timeout'
  | 'callRecording.stopped.joined'
  | 'callRecording.stopped.other';

const noticeKey = (notice: CallRecordingNotice): NoticeKey => {
  if (notice.kind === 'saved') return 'callRecording.saved';
  if (notice.kind === 'save-failed') return 'callRecording.saveFailed';
  if (notice.kind === 'unavailable') return 'callRecording.unavailable';
  if (notice.reason === 'refused') return 'callRecording.stopped.refused';
  if (notice.reason === 'timeout') return 'callRecording.stopped.timeout';
  if (notice.reason === 'participant-joined') return 'callRecording.stopped.joined';
  return 'callRecording.stopped.other';
};

const TOP = 'calc(env(safe-area-inset-top) + 3.75rem)';

export function CallRecordingPanel({
  state,
  requesterName,
  language,
  onAnswer,
  onStop,
  onDismiss,
}: {
  readonly state: CallRecordingState;
  readonly requesterName: string;
  readonly language: InterfaceLanguage;
  readonly onAnswer: (accepted: boolean) => void;
  readonly onStop: () => void;
  readonly onDismiss: () => void;
}) {
  const { view, notice } = state;
  if (view.kind === 'pending' && view.mustAnswer) {
    const question = translate(language, 'callRecording.ask', { name: requesterName });
    return (
      <div
        role="alertdialog"
        aria-label={question}
        className="fixed inset-x-3 z-[215] mx-auto flex max-w-md flex-col gap-3 rounded-card p-4 shadow-lg"
        style={{ background: PILL_BG, color: '#fff', top: TOP }}
        data-call-recording-ask=""
      >
        <p className="text-body font-semibold">{question}</p>
        <p className="text-mini" style={{ color: 'rgba(255,255,255,0.72)' }}>
          {translate(language, 'callRecording.askDetail')}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onAnswer(false)} className="min-h-11 rounded-full px-4 text-body font-semibold" style={{ background: 'rgba(255,255,255,0.14)' }} data-call-recording-answer="refuse">
            {translate(language, 'callRecording.refuse')}
          </button>
          <button type="button" onClick={() => onAnswer(true)} className="min-h-11 rounded-full px-4 text-body font-semibold" style={{ background: ACCEPT }} data-call-recording-answer="accept">
            {translate(language, 'callRecording.accept')}
          </button>
        </div>
      </div>
    );
  }
  if (view.kind === 'pending' || view.kind === 'recording' || view.kind === 'asking') {
    const recording = view.kind === 'recording';
    const label = translate(language, recording ? 'callRecording.active' : 'callRecording.waiting');
    return (
      <div
        role="status"
        className="fixed inset-x-0 z-[215] mx-auto flex w-fit items-center gap-2 rounded-full py-1 pl-4 pr-1 text-body shadow-lg"
        style={{ background: PILL_BG, color: '#fff', top: TOP }}
        data-call-recording-indicator={recording ? 'recording' : 'waiting'}
      >
        <span aria-hidden className={recording ? 'size-2.5 animate-pulse rounded-full' : 'size-2.5 rounded-full'} style={{ background: RECORD_RED }} />
        <span className="font-semibold">{label}</span>
        {view.kind === 'asking' ? <span className="size-11" /> : (
          <button
            type="button"
            onClick={onStop}
            aria-label={translate(language, recording ? 'callRecording.stop' : 'callRecording.cancel')}
            className="grid size-11 place-items-center rounded-full"
            data-call-recording-stop=""
          >
            <span aria-hidden className="size-3.5 rounded-[3px]" style={{ background: '#fff' }} />
          </button>
        )}
      </div>
    );
  }
  if (notice === null) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 z-[215] mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full py-1 pl-4 pr-1 text-body shadow-lg"
      style={{ background: PILL_BG, color: '#fff', top: TOP }}
      data-call-recording-notice={notice.kind}
    >
      <span>{translate(language, noticeKey(notice))}</span>
      <button type="button" onClick={onDismiss} aria-label={translate(language, 'callRecording.close')} className="grid size-11 place-items-center rounded-full">
        <span aria-hidden>×</span>
      </button>
    </div>
  );
}

export default function CallRecordingLayer() {
  const state = useStore(callRecordingStore);
  const requesterId = state.view.kind === 'pending' ? state.view.requesterId : null;
  const requesterName = useStore(callStore, (calls) => (requesterId === null ? null : (calls.call?.members[requesterId]?.name ?? null)));
  const language = currentInterfaceLanguage();
  const noticeShown = state.view.kind === 'idle' && state.notice !== null;
  useEffect(() => {
    if (!noticeShown) return undefined;
    const handle = setTimeout(callRecording.dismiss, NOTICE_MS);
    return () => clearTimeout(handle);
  }, [noticeShown, state.notice]);
  return (
    <CallRecordingPanel
      state={state}
      requesterName={requesterName ?? translate(language, 'callRecording.someone')}
      language={language}
      onAnswer={(accepted) => void callRecording.answer(accepted)}
      onStop={() => void callRecording.stop()}
      onDismiss={callRecording.dismiss}
    />
  );
}
