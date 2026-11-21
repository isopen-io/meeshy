import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';

import { appQueryClient } from '@/lib/api/query-client';
import { callActions } from '@/lib/calls/call-actions';
import { callJournalMemory } from '@/lib/calls/call-journal-memory';
import { callIdentityOf, callNoticeGesture, callParticipantsLine, type CallNoticeGesture, type CallNoticeTarget } from '@/lib/calls/call-notice';
import { callsAvailable } from '@/lib/calls/calls-availability';
import { conversationActiveCallQuery } from '@/lib/calls/conversation-active-call-query';
import { repairEndedCall } from '@/lib/calls/ended-call-repair';
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
 * A1.1). Sous le titre, la ligne des participants (#17868, `participantsLine`) : « Awa, Karim et vous »,
 * en texte secondaire, absente quand la passerelle n'en a servi aucun — rien ne s'invente ici.
 *
 * `role="status"` NON POSÉ, comme toute rangée système ; le conteneur porte `aria-label`, le titre et la ligne des
 * participants sont `aria-hidden` (le libellé du conteneur porte les deux) — la bascule et le journal, eux, restent lisibles et atteignables.
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
  const gesture = useCallNoticeGesture(target);
  const participants = callTarget === null ? null : callParticipantsLine({ participants: callTarget.participants, viewerId: callTarget.viewerId, language });
  const shown = target?.live === true && gesture === 'call-back' ? { ...row, text: translate(language, 'call.ended.remote') } : row;
  const label = systemRowLabel(shown, language);
  return (
    <div data-system="call" className="flex flex-col items-center gap-[3px]" aria-label={participants === null ? label : `${label}, ${participants}`}>
      <SystemNoticeTime timeString={timeString} />
      <CallCard row={shown} target={target} participants={participants} language={language} />
      {target !== null ? <CallNoticeAction target={target} gesture={gesture} languages={languages} language={language} /> : null}
    </div>
  );
}

/** Les appels qu'une carte a déjà réparés (#19778) : une carte restée `call-live` en base ne relit son fil qu'une fois par session, même remontée par le défilement. */
const repairedCalls = new Set<string>();

/**
 * Le geste de la carte (#19778, `callNoticeGesture`) : une carte « en cours » reconfirme le sondage du fil à
 * chaque montage (`staleTime: 0`, requête partagée avec la pastille de l'en-tête) ; quand la passerelle ne voit
 * plus cet appel, la carte répare ce que le client en tenait pour vivant (`repairEndedCall`).
 */
function useCallNoticeGesture(target: CallNoticeTarget | null): CallNoticeGesture | null {
  const live = target?.live === true;
  const probe = useQuery({ ...conversationActiveCallQuery(target?.conversationId ?? ''), enabled: live, staleTime: 0 }, appQueryClient);
  const gesture = target === null ? null : callNoticeGesture(target, { served: probe.data, confirming: probe.isFetching });
  const conversationId = target?.conversationId ?? null;
  const callId = target?.callId ?? null;
  const ended = live && gesture === 'call-back';
  useEffect(() => {
    if (!ended || conversationId === null || callId === null || repairedCalls.has(callId)) return;
    repairedCalls.add(callId);
    repairEndedCall(appQueryClient, { conversationId, callId });
  }, [ended, conversationId, callId]);
  return gesture;
}

function CallCard({ row, target, participants, language }: { readonly row: CallRow; readonly target: CallNoticeTarget | null; readonly participants: string | null; readonly language: InterfaceLanguage }) {
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
        <span className="flex min-w-0 flex-col">
          <span data-call-card-title="" className="text-[15px] font-semibold" style={{ color: 'var(--color-ios-ink)' }} aria-hidden>
            {row.text}
          </span>
          {participants === null ? null : (
            <span data-call-card-participants="" className="truncate text-[12.5px] font-medium" style={{ color: 'var(--color-ios-ink-2)' }} aria-hidden>
              {participants}
            </span>
          )}
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
function CallNoticeAction({ target, gesture, languages, language }: { readonly target: CallNoticeTarget; readonly gesture: CallNoticeGesture | null; readonly languages: readonly string[]; readonly language: InterfaceLanguage }) {
  const onClick = () => {
    const request = { conversationId: target.conversationId, media: target.media, ...callIdentityOf(target.conversationId) };
    if (gesture === 'join') callActions.join({ ...request, callId: target.callId });
    else callActions.start(request);
  };
  return (
    <>
      {gesture === null ? null : (
        <button type="button" data-call-notice-action={gesture} onClick={onClick} className="min-h-11 rounded-chip px-3 text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>
          {translate(language, gesture === 'join' ? 'call.bubble.join' : 'call.bubble.callBack')}
        </button>
      )}
      {target.recording !== null ? (
        <div data-call-recording={target.recording.attachment.id} className="flex w-full max-w-[320px] justify-center">
          <Attachments attachments={[target.recording.attachment]} languages={languages} fallbackLanguage={target.recording.language} mediaFrame="box" />
        </div>
      ) : null}
    </>
  );
}
