import { useEffect, useRef, useState } from 'react';

import { captionText, overlayCaptions, type CallCaption } from '@/lib/calls/call-captions';
import type { ActiveCall } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE PANNEAU DES SOUS-TITRES D'UN APPEL** (#8048) — le bandeau des deux
 * dernières lignes dites (`CallTranscriptionOverlay` d'iOS) et, d'un toucher,
 * le journal de tout l'appel. Chunk à part : l'écran d'appel ne le charge
 * qu'au premier passage en mode traduit.
 *
 * Accessibilité : le bandeau est une région `aria-live` POLIE, mais une ligne
 * encore en révision y est `aria-hidden` — un lecteur d'écran annonce la
 * phrase dite, pas chaque mot corrigé. Le texte d'une ligne porte `dir="auto"` :
 * une phrase arabe se lit de droite à gauche même sous une interface française.
 */

const INK_2 = 'rgba(255,255,255,0.72)';
const PANEL = 'rgba(0,0,0,0.55)';

const NOTE_KEY = { listening: 'callCaptions.listening', unsupported: 'callCaptions.unsupported', denied: 'callCaptions.denied' } as const;

export function CallCaptionsPanel({ call, language }: { readonly call: ActiveCall; readonly language: InterfaceLanguage }) {
  const [journalOpen, setJournalOpen] = useState(false);
  const journal = useRef<HTMLOListElement>(null);
  const mode = call.captionsMode;
  const lines = overlayCaptions(call.captions);
  const note = call.transcription === 'idle' ? null : NOTE_KEY[call.transcription];
  const speaker = (caption: CallCaption): string => (caption.mine ? translate(language, 'message.author.self') : caption.speakerName !== '' ? caption.speakerName : translate(language, 'callCaptions.participant'));
  const clock = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  useEffect(() => {
    const list = journal.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [journalOpen, call.captions.length]);

  return (
    <section aria-label={translate(language, 'callCaptions.region')} className="mx-4 flex flex-col gap-1.5" data-call-captions-panel={mode}>
      <div aria-live="polite" className="flex flex-col gap-1 rounded-card px-3 py-2 text-body" style={{ background: PANEL }} data-call-caption-lines="">
        {lines.length === 0 ? (
          <p style={{ color: INK_2 }}>{translate(language, 'callCaptions.waiting')}</p>
        ) : (
          lines.map((caption) => (
            <p key={caption.id} aria-hidden={caption.isFinal ? undefined : true} style={caption.isFinal ? undefined : { opacity: 0.7 }} data-call-caption={caption.mine ? 'mine' : 'peer'}>
              <strong>{speaker(caption)} · </strong>
              <span dir="auto">{captionText(caption, mode)}</span>
            </p>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-mini" style={{ color: INK_2 }}>
        <span data-call-captions-mode={mode}>{translate(language, mode === 'original' ? 'callCaptions.mode.original' : 'callCaptions.mode.translated')}</span>
        {note === null ? null : <span data-call-captions-note={call.transcription}>{translate(language, note)}</span>}
        <button
          type="button"
          aria-expanded={journalOpen}
          aria-controls="call-captions-journal"
          onClick={() => setJournalOpen((open) => !open)}
          className="min-h-11 min-w-11 rounded-full px-3 font-semibold text-white"
          data-call-captions-journal-toggle=""
        >
          {translate(language, journalOpen ? 'callCaptions.journal.hide' : 'callCaptions.journal.show')}
        </button>
      </div>
      {journalOpen ? (
        <ol
          ref={journal}
          id="call-captions-journal"
          aria-label={translate(language, 'callCaptions.journal.title')}
          className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto rounded-card px-3 py-2 text-mini"
          style={{ background: PANEL }}
          data-call-captions-journal=""
        >
          {call.captions.map((caption) => (
            <li key={caption.id} data-call-journal-entry={caption.mine ? 'mine' : 'peer'}>
              <span className="block" style={{ color: INK_2 }}>
                {speaker(caption)} · <time dateTime={new Date(caption.at).toISOString()}>{clock.format(caption.at)}</time>
              </span>
              <span className="block text-body" dir="auto">
                {captionText(caption, mode)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
