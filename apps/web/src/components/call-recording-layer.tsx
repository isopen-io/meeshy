import { useEffect, useRef, type CSSProperties } from 'react';
import { useStore } from 'zustand/react';

import { MeeshyGlass } from '@/components/kit/meeshy-glass-tone';
import { callChromeStore, usePublishRecordingCard } from '@/lib/calls/call-chrome-store';
import { HeldSwap, useFollowPlace, useStowFade } from '@/lib/calls/use-pill-motion';
import type { CallRecordingNotice, CallRecordingState } from '@/lib/calls/call-recording';
import { callRecording } from '@/lib/calls/call-recording-live';
import { callRecordingStore } from '@/lib/calls/call-recording-store';
import { callStore } from '@/lib/calls/call-store';
import { topBannersAbove } from '@/lib/calls/call-top-banners';
import { translateCallRecording as translate } from '@/lib/i18n-call-recording-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE CHACUN VOIT D'UN ENREGISTREMENT D'APPEL** (#8064) — chunk à part,
 * monté par `call-layer.tsx` seulement quand une demande, un enregistrement ou
 * un mot de fin existe. La question à ceux qui doivent consentir, l'attente
 * du demandeur, l'indicateur PERSISTANT posé chez tous tant que ça enregistre
 * (chacun peut l'arrêter : retirer son accord), et le mot qui dit pourquoi
 * ça s'est arrêté. Au-dessus de l'écran d'appel comme de sa pastille.
 *
 * **Trois bandeaux d'UNE case de la pile** (`CallRecordingBannerStage` d'iOS, R2.1, R3.11) : la carte
 * d'accord, la capsule (l'attente PUIS l'enregistrement : la même, dont seuls les mots changent) et
 * l'avis. Tous en verre partagé (`MeeshyGlass`, jamais un aplat peint), tous entrent par le haut et
 * repartent vers le haut en fondu (`HeldSwap`, forme `top`, comme le bandeau de partage) ; la capsule se
 * range avec l'en-tête, la carte jamais (G1.6).
 */

const RECORD_RED = 'var(--ios-error-strong)';
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

/** Sous l'en-tête, et sous les bandeaux que la pile pose avant lui (`call-top-banners.ts`, P16.7) : le partage d'écran. */
const topOf = (offset: number): string => `calc(env(safe-area-inset-top) + 3.75rem + ${offset}px)`;

/** Le point rouge de la planche : il bat tant que ça enregistre. */
const RecordingDot = ({ pulse }: { readonly pulse: boolean }) => (
  <span aria-hidden className={pulse ? 'size-2.5 shrink-0 animate-pulse rounded-full' : 'size-2.5 shrink-0 rounded-full'} style={{ background: RECORD_RED }} />
);

type Ask = { readonly question: string };
type Status = { readonly recording: boolean; readonly asking: boolean };

/**
 * LA CARTE D'ACCORD (R2) — la question sur une rangée, avec le point rouge ; dessous deux moitiés égales,
 * Refuser (un disque de verre) au début, Accepter (blanc plein) à la fin. Elle ne se range jamais (G1.6). Sa
 * hauteur MESURÉE est publiée à la pile, qui lui garde cette case (R2.1) tant qu'elle attend une réponse, et non le temps de son départ ; sa place suit sa case quand un
 * bandeau arrive ou repart (S2.6).
 */
function AskCard({ ask, language, onAnswer, offset, reserves }: { readonly ask: Ask; readonly language: InterfaceLanguage; readonly onAnswer: (accepted: boolean) => void; readonly offset: number; readonly reserves: boolean }) {
  const node = useRef<HTMLDivElement>(null);
  usePublishRecordingCard(node, reserves);
  useFollowPlace(node, offset);
  return (
    <div ref={node}>
      <MeeshyGlass role="alertdialog" aria-label={ask.question} density="dense" className="flex flex-col gap-3 rounded-card p-4 text-on-media" data-call-recording-ask="">
        <div className="flex items-center gap-2">
          <RecordingDot pulse={false} />
          <p className="text-body font-semibold">{ask.question}</p>
        </div>
        <div className="flex gap-2.5">
          <button type="button" onClick={() => onAnswer(false)} className="glass-call-disc min-h-11 flex-1 rounded-full px-4 text-body font-semibold" data-call-recording-answer="refuse">
            {translate(language, 'callRecording.refuse')}
          </button>
          <button type="button" onClick={() => onAnswer(true)} className="min-h-11 flex-1 rounded-full px-4 text-body font-semibold active:opacity-80" style={{ background: 'var(--color-on-media)', color: 'var(--ios-indigo-950)' }} data-call-recording-answer="accept">
            {translate(language, 'callRecording.accept')}
          </button>
        </div>
      </MeeshyGlass>
    </div>
  );
}

/**
 * LA CAPSULE (R3) — « En attente de l'accord de tous… » puis « Enregistrement en cours » : le même élément,
 * dont seuls les mots changent. Le bouton dit le mot (« Arrêter », « Annuler » pendant l'attente), blanc plein
 * au texte rouge comme celui du bandeau de partage, 44 px de cible. Elle se range avec le reste de l'appel
 * quand un toucher range tout, ou qu'un mode a masqué l'en-tête (G1.1, R3.6, #17551) : elle repart vers le
 * haut comme lui, et revient avec lui (`call-motion.css`, `call-chrome-store.ts`). Sa place suit sa case de
 * la pile en glissant quand un bandeau arrive ou repart (S2.6).
 */
function StatusCapsule({ status, language, stowed, offset, onStop }: { readonly status: Status; readonly language: InterfaceLanguage; readonly stowed: boolean; readonly offset: number; readonly onStop: () => void }) {
  const node = useRef<HTMLDivElement>(null);
  useStowFade(node, stowed);
  useFollowPlace(node, offset);
  const { recording, asking } = status;
  return (
    <div
      ref={node}
      role="status"
      aria-hidden={stowed ? true : undefined}
      style={{ '--stow-clearance': '3.75rem' } as CSSProperties}
      data-call-stow="top"
      data-call-stowed={stowed ? '' : undefined}
      data-call-recording-indicator={recording ? 'recording' : 'waiting'}
    >
      <MeeshyGlass density="dense" className="flex items-center gap-2 rounded-full py-1 ps-4 pe-1 text-body text-on-media">
        <RecordingDot pulse={recording} />
        <span className="font-semibold">{translate(language, recording ? 'callRecording.active' : 'callRecording.waiting')}</span>
        {asking ? (
          <span className="size-11" />
        ) : (
          <button
            type="button"
            onClick={onStop}
            aria-label={translate(language, recording ? 'callRecording.stop' : 'callRecording.cancel')}
            className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-body font-bold"
            style={{ background: 'var(--color-on-media)', color: 'var(--ios-error-dark)' }}
            data-call-recording-stop=""
          >
            {translate(language, recording ? 'callRecording.stopShort' : 'callRecording.cancel')}
          </button>
        )}
      </MeeshyGlass>
    </div>
  );
}

export function CallRecordingPanel({
  state,
  requesterName,
  language,
  onAnswer,
  onStop,
  onDismiss,
  stowed = false,
  offset = 0,
}: {
  readonly state: CallRecordingState;
  readonly requesterName: string;
  readonly language: InterfaceLanguage;
  readonly onAnswer: (accepted: boolean) => void;
  readonly onStop: () => void;
  readonly onDismiss: () => void;
  /** Un toucher (ou un mode) a rangé les commandes : la capsule part avec elles (G1.1, R3.6). */
  readonly stowed?: boolean;
  /** Ce que les bandeaux posés avant lui prennent sous l'en-tête (px). */
  readonly offset?: number;
}) {
  const top = topOf(offset);
  const { view, notice } = state;
  const asking = view.kind === 'pending' && view.mustAnswer;
  const ask: Ask | null = asking ? { question: translate(language, view.recordingKind === 'video' ? 'callRecording.askVideo' : 'callRecording.ask', { name: requesterName }) } : null;
  const status: Status | null = !asking && view.kind !== 'idle' ? { recording: view.kind === 'recording', asking: view.kind === 'asking' } : null;
  const word = view.kind === 'idle' ? notice : null;
  return (
    <>
      <HeldSwap value={ask} shape="top" className="fixed inset-x-3 z-[215] mx-auto max-w-md" style={{ top }} data-call-recording-layer="ask">
        {(held) => <AskCard ask={held} language={language} onAnswer={onAnswer} offset={offset} reserves={ask !== null} />}
      </HeldSwap>
      <HeldSwap value={status} shape="top" className="fixed inset-x-0 z-[215] mx-auto w-fit" style={{ top }} data-call-recording-layer="status">
        {(held) => <StatusCapsule status={held} language={language} stowed={stowed} offset={offset} onStop={onStop} />}
      </HeldSwap>
      <HeldSwap value={word} shape="top" className="fixed inset-x-0 z-[215] mx-auto w-fit max-w-[calc(100vw-2rem)]" style={{ top }} data-call-recording-layer="notice">
        {(held) => (
          <MeeshyGlass role="status" density="dense" className="flex items-center gap-2 rounded-full py-1 ps-4 pe-1 text-body text-on-media" data-call-recording-notice={held.kind}>
            <span>{translate(language, noticeKey(held))}</span>
            <button type="button" onClick={onDismiss} aria-label={translate(language, 'callRecording.close')} className="grid size-11 place-items-center rounded-full">
              <span aria-hidden>×</span>
            </button>
          </MeeshyGlass>
        )}
      </HeldSwap>
    </>
  );
}

export default function CallRecordingLayer() {
  const state = useStore(callRecordingStore);
  const requesterId = state.view.kind === 'pending' ? state.view.requesterId : null;
  const requesterName = useStore(callStore, (calls) => (requesterId === null ? null : (calls.call?.members[requesterId]?.name ?? null)));
  const language = currentInterfaceLanguage();
  const stowed = useStore(callChromeStore, (chrome) => chrome.stowed);
  const offset = useStore(callStore, (calls) => topBannersAbove('recording', { 'screen-share': calls.call?.display === 'full' && calls.call.screenSharing }));
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
      stowed={stowed}
      offset={offset}
    />
  );
}
