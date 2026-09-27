import { useEffect, useRef, useState } from 'react';

import { captionLanguageLabel, captionText, overlayCaptions, type CallCaption, type CaptionsMode } from '@/lib/calls/call-captions';
import type { ActiveCall } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE BANDEAU DES SOUS-TITRES D'UN APPEL** (#8048, #8393) — les deux
 * dernières lignes dites (`CallTranscriptionOverlay` d'iOS) dans un verre
 * d'appel sombre posé juste au-dessus de la pilule, qui reste quand les
 * actions sont rangées ; en groupe, il se pose en haut du cadre de verre de la
 * pilule (`surface="inset"` : le verre est celui du cadre, jamais un verre sur
 * du verre). Chunk à part : l'écran d'appel ne le charge qu'au premier passage
 * en mode traduit.
 *
 * Le nom de chaque personne porte SA couleur (`call-speaker-color.ts`), la
 * même que le liseré de sa vignette dans la grille. Une ligne traduite porte
 * une petite étiquette « EN → FR » — le Prisme dit discrètement qu'il a agi —
 * et un toucher sur la phrase déplie son original sous elle. « Journal » ouvre
 * tout l'appel, avec Traduit / Original.
 *
 * Accessibilité : la région est `aria-live` POLIE, mais une ligne encore en
 * révision y est `aria-hidden` — un lecteur d'écran annonce la phrase dite, pas
 * chaque mot corrigé. Tout texte dit porte `dir="auto"` : une phrase arabe se
 * lit de droite à gauche même sous une interface française.
 */

const INK_2 = 'rgba(255,255,255,0.72)';

const NOTE_KEY = { listening: 'callCaptions.listening', unsupported: 'callCaptions.unsupported', denied: 'callCaptions.denied' } as const;

export type CaptionsSurface = 'glass' | 'inset';

/**
 * La couleur d'un locuteur, REMISE par l'écran d'appel (`call-speaker-color.ts`)
 * plutôt qu'importée : ce chunk à part n'importe rien de statique du chunk de
 * l'écran d'appel (`budgets.json` › `call_overlay.dynamic_only`).
 */
export type SpeakerColorOf = (caption: CallCaption) => string;

function CaptionLine({
  caption,
  mode,
  speaker,
  color,
  open,
  onToggle,
}: {
  readonly caption: CallCaption;
  readonly mode: CaptionsMode;
  readonly speaker: string;
  readonly color: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const shown = captionText(caption, mode);
  const languages = captionLanguageLabel(caption, mode);
  const unfoldable = shown !== caption.original;
  const content = (
    <>
      <strong style={{ color }}>{speaker} · </strong>
      <span dir="auto">{shown}</span>
      {languages === null ? null : (
        <span className="ms-1.5 inline-block rounded px-1 align-middle text-[10px] font-semibold tracking-wide" style={{ color: INK_2, border: `1px solid ${INK_2}` }} data-call-caption-languages="">
          {languages}
        </span>
      )}
    </>
  );
  return (
    <div aria-hidden={caption.isFinal ? undefined : true} style={caption.isFinal ? undefined : { opacity: 0.7 }} data-call-caption={caption.mine ? 'mine' : 'peer'}>
      {unfoldable ? (
        <button type="button" aria-expanded={open} onClick={onToggle} className="block min-h-11 w-full text-start" data-call-caption-line={caption.id}>
          {content}
        </button>
      ) : (
        <p className="py-1" data-call-caption-line={caption.id}>
          {content}
        </p>
      )}
      {unfoldable && open ? (
        <span className="block ps-3 text-mini" style={{ color: INK_2 }} dir="auto" lang={caption.pair?.from} data-call-caption-original="">
          {caption.original}
        </span>
      ) : null}
    </div>
  );
}

export function CallCaptionsPanel({ call, language, colorOf, surface = 'glass' }: { readonly call: ActiveCall; readonly language: InterfaceLanguage; readonly colorOf: SpeakerColorOf; readonly surface?: CaptionsSurface }) {
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalOriginal, setJournalOriginal] = useState(false);
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(() => new Set());
  const journal = useRef<HTMLOListElement>(null);
  const mode = call.captionsMode;
  const lines = overlayCaptions(call.captions);
  const note = call.transcription === 'idle' ? null : NOTE_KEY[call.transcription];
  const speaker = (caption: CallCaption): string => (caption.mine ? translate(language, 'message.author.self') : caption.speakerName !== '' ? caption.speakerName : translate(language, 'callCaptions.participant'));
  const clock = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const journalMode: CaptionsMode = journalOriginal ? 'original' : mode;
  const journalTranslates = mode === 'translated' && call.captions.some((caption) => captionText(caption, 'translated') !== caption.original);
  const toggle = (id: string) => () => setUnfolded((current) => (current.has(id) ? new Set([...current].filter((entry) => entry !== id)) : new Set([...current, id])));

  useEffect(() => {
    const list = journal.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [journalOpen, call.captions.length]);

  return (
    <section
      aria-label={translate(language, 'callCaptions.region')}
      className={`${surface === 'glass' ? 'glass-call-prominent mx-4 rounded-card ' : ''}flex flex-col gap-1.5 px-3 py-2`}
      data-call-captions-panel={mode}
      data-call-captions-surface={surface}
    >
      <div aria-live="polite" className="flex flex-col text-body" data-call-caption-lines="">
        {lines.length === 0 ? (
          <p style={{ color: INK_2 }}>{translate(language, 'callCaptions.waiting')}</p>
        ) : (
          lines.map((caption) => <CaptionLine key={caption.id} caption={caption} mode={mode} speaker={speaker(caption)} color={colorOf(caption)} open={unfolded.has(caption.id)} onToggle={toggle(caption.id)} />)
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
        <div className="flex flex-col gap-1">
          {journalTranslates ? (
            <button
              type="button"
              aria-pressed={journalOriginal}
              onClick={() => setJournalOriginal((value) => !value)}
              className="min-h-11 self-start rounded-full px-3 text-mini font-semibold text-white"
              data-call-captions-journal-original=""
            >
              {translate(language, journalOriginal ? 'callTranscript.showTranslated' : 'callTranscript.showOriginal')}
            </button>
          ) : null}
          <ol ref={journal} id="call-captions-journal" aria-label={translate(language, 'callCaptions.journal.title')} className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto text-mini" data-call-captions-journal="">
            {call.captions.map((caption) => (
              <li key={caption.id} data-call-journal-entry={caption.mine ? 'mine' : 'peer'}>
                <span className="block" style={{ color: INK_2 }}>
                  <span style={{ color: colorOf(caption) }}>{speaker(caption)}</span> · <time dateTime={new Date(caption.at).toISOString()}>{clock.format(caption.at)}</time>
                </span>
                <span className="block text-body" dir="auto">
                  {captionText(caption, journalMode)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
