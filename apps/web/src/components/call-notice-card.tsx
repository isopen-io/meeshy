import { lazy, Suspense, useState } from 'react';

import { callActions } from '@/lib/calls/call-actions';
import { callJournalMemory } from '@/lib/calls/call-journal-memory';
import { callIdentityOf, type CallNoticeTarget } from '@/lib/calls/call-notice';
import { callsAvailable } from '@/lib/calls/calls-availability';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { SystemRow } from '@/lib/view/message-badges';
import { systemRowLabel } from '@/lib/view/message-badges';

import { Attachments } from './attachment-blocks';
import { Glyph, GlyphSvg } from './glyph';
import { THREAD_STATES_GLYPHS } from './glyphs-thread-states';
import { SystemNoticeTime } from './system-notice-time';

/**
 * **LA BULLE D'APPEL EST UNE CARTE** (#17878, A1.2 ; `BubbleCallNoticeView.swift`, planche A1/A2) — un disque
 * à la teinte de l'appel porte le glyphe du média, le titre dit l'appel, la bascule du journal vit DANS la
 * carte, et le journal s'y déplie. Elle ne l'offre qu'à un appel abouti (`CallNoticeTarget.transcript`,
 * A1.1). La ligne des participants attend la passerelle, qui ne les sert pas encore sur le résumé (#17868) :
 * rien ne s'invente ici.
 *
 * `role="status"` NON POSÉ, comme toute rangée système ; le conteneur porte `aria-label`, le titre est
 * `aria-hidden` — la bascule et le journal, eux, restent lisibles et atteignables.
 */
/** Le journal ET son fondu se chargent au toucher, ensemble (le doigt qui se pose les demande déjà) : la carte du fil n'importe rien de l'appel. */
const loadJournal = () => Promise.all([import('./call-journal-fold'), import('./call-transcript-panel')]).then(([fold]) => fold);

const CallJournalFold = lazy(() => loadJournal().then((module) => ({ default: module.CallJournalFold })));

type CallRow = Extract<SystemRow, { readonly kind: 'call' }>;

export function CallNotice({
  row,
  timeString,
  callTarget,
  languages,
  language,
}: {
  readonly row: CallRow;
  readonly timeString: string;
  readonly callTarget: CallNoticeTarget | null;
  readonly languages: readonly string[];
  readonly language: InterfaceLanguage;
}) {
  const target = callTarget !== null && callsAvailable() ? callTarget : null;
  return (
    <div data-system="call" className="flex flex-col items-center gap-[3px]" aria-label={systemRowLabel(row, language)}>
      <SystemNoticeTime timeString={timeString} />
      <CallCard row={row} target={target} language={language} />
      {target !== null ? <CallNoticeAction target={target} languages={languages} language={language} /> : null}
    </div>
  );
}

function CallCard({ row, target, language }: { readonly row: CallRow; readonly target: CallNoticeTarget | null; readonly language: InterfaceLanguage }) {
  const callId = target !== null && target.transcript ? target.callId : null;
  const [open, setOpen] = useState(() => callId !== null && callJournalMemory.isOpen(callId));
  const [restored] = useState(open);
  const [engaged, setEngaged] = useState(open);
  const transcriptId = callId === null ? undefined : `call-transcript-${callId}`;
  const toggle = () => {
    if (callId === null) return;
    callJournalMemory.setOpen(callId, !open);
    setEngaged(true);
    setOpen(!open);
  };
  return (
    <div data-call-card="" className="call-notice-card flex w-full max-w-[560px] flex-col gap-2 rounded-card px-3 py-2.5 text-start">
      <div className="flex items-center gap-3">
        <span data-call-card-disc="" className="call-notice-disc grid size-10 shrink-0 place-items-center rounded-full" aria-hidden>
          {row.callType === 'video' ? <GlyphSvg glyph={THREAD_STATES_GLYPHS.videoCamera} size={20} /> : <Glyph name="phone" size={20} />}
        </span>
        <span data-call-card-title="" className="text-[15px] font-semibold" style={{ color: 'var(--color-ios-ink)' }} aria-hidden>
          {row.text}
        </span>
      </div>
      {callId !== null ? (
        <button
          type="button"
          data-call-transcript-toggle=""
          aria-expanded={open}
          aria-controls={open ? transcriptId : undefined}
          onClick={toggle}
          onPointerDown={() => void loadJournal()}
          className="call-notice-toggle min-h-11 self-start rounded-full px-4 text-[13px] font-semibold"
        >
          {translate(language, open ? 'callTranscript.hide' : 'callTranscript.show')}
        </button>
      ) : null}
      {engaged && callId !== null && transcriptId !== undefined ? (
        <Suspense fallback={null}>
          <CallJournalFold id={transcriptId} callId={callId} open={open} restored={restored} language={language} original={callJournalMemory.isOriginal(callId)} onOriginalChange={(original) => callJournalMemory.setOriginal(callId, original)} />
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * RAPPELER / REJOINDRE (`BubbleCallNoticeView.swift`) — iOS le pose au DOUBLE tap de la carte pour qu'un doigt
 * qui défile ne sonne chez personne ; au web, un bouton NOMMÉ sous la carte porte le même geste sans rien de
 * caché. L'enregistrement consenti se réécoute dessous.
 */
function CallNoticeAction({ target, languages, language }: { readonly target: CallNoticeTarget; readonly languages: readonly string[]; readonly language: InterfaceLanguage }) {
  const onClick = () => {
    const request = { conversationId: target.conversationId, media: target.media, ...callIdentityOf(target.conversationId) };
    if (target.live) callActions.join({ ...request, callId: target.callId });
    else callActions.start(request);
  };
  return (
    <>
      <button type="button" data-call-notice-action={target.live ? 'join' : 'call-back'} onClick={onClick} className="min-h-11 rounded-chip px-3 text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>
        {translate(language, target.live ? 'call.bubble.join' : 'call.bubble.callBack')}
      </button>
      {target.recording !== null ? (
        <div data-call-recording={target.recording.attachment.id} className="flex w-full max-w-[320px] justify-center">
          <Attachments attachments={[target.recording.attachment]} languages={languages} fallbackLanguage={target.recording.language} mediaFrame="box" />
        </div>
      ) : null}
    </>
  );
}
