import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useStore } from 'zustand/react';

import { JournalNoteSentence, noteDirection } from '@/components/call-journal-note';
import { THREAD_SECONDARY_INK, UnfoldedOriginal } from '@/components/call-unfolded-original';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { formatCallJournalClock } from '@/lib/calls/call-journal-clock';
import { transcriptReading } from '@/lib/calls/call-transcript-reading';
import { useTranscriptSwapFade } from '@/lib/calls/use-transcript-swap-fade';
import { callTranscriptQueryKey, loadCallTranscript, transcriptEntries, transcriptLines, transcriptNotes, type TranscriptLine, type TranscriptNote } from '@/lib/calls/call-transcript';
import { suspendForCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { authorInkStyle } from '@/lib/view/author-ink';
import { useReaderLanguages } from '@/lib/view/use-reader';

/**
 * **LA TRANSCRIPTION D'UN APPEL, DANS SA BULLE** (#8048, G6) — dépliée sous la
 * bulle d'appel du fil (`system-notice.tsx`), chargée au toucher (chunk à part)
 * depuis `GET /calls/:callId/transcript`. Miroir de la section « Transcription »
 * de `CallSummaryDetailSheet` d'iOS : le locuteur, l'heure dans l'appel, la
 * ligne servie par le Prisme du lecteur, et « Voir l'original » qui INVERSE les
 * deux lignes de tout l'appel (#17897, loi 7, #17862) : l'original en tête et
 * « Traduit · … » dessous, « Voir la traduction » rendant l'état par défaut
 * (`transcriptReading`, `useTranscriptSwapFade`). Gardée en cache par sa clé : la rouvrir ne recharge rien.
 *
 * Le journal d'après l'appel est FIDÈLE au journal de l'appel (#16634,
 * `docs/product/appels-vue-finale.md` lois 4 et 7) : chaque ligne garde la
 * couleur de son auteur sur le nom, et sur la phrase quand elle est TRADUITE,
 * tirée de la loi partagée `authorAccentColor` et rendue lisible sur le fond
 * du fil (`authorInk`) ; un original reste à l'encre du thème.
 *
 * Les captures d'écran et les moments de l'enregistrement consenti y entrent
 * à leur heure dans l'appel (#16665, loi 13) : la phrase à l'encre secondaire,
 * le pseudo seul à son encre d'auteur.
 */

const muted = { color: 'var(--color-ios-ink-2)' } as const;

/**
 * Le journal DANS sa bulle ou dans la fiche d'un appel : rend « Voir l'original » dans l'état que sa bulle a
 * retenu (`original`, `onOriginalChange` : la mémoire `call-journal-memory.ts` est celle de la carte — A1.17).
 */
export function CallTranscriptPanel({ callId, language, original: initial = false, onOriginalChange }: { readonly callId: string; readonly language: InterfaceLanguage; readonly original?: boolean; readonly onOriginalChange?: (original: boolean) => void }) {
  suspendForCallControlsCatalog(language);
  const session = useStore(sessionStore, (state) => state.session);
  const { languages } = useReaderLanguages();
  const [original, setOriginal] = useState(initial);
  const toggleOriginal = () => {
    onOriginalChange?.(!original);
    setOriginal(!original);
  };
  const transcript = useQuery(
    {
      queryKey: callTranscriptQueryKey(callId),
      queryFn: async ({ signal }) => unwrap(await loadCallTranscript(apiDeps, callId, signal)),
      staleTime: 60_000,
      retry: false,
    },
    appQueryClient,
  );
  const viewerId = resolveViewer({ source: apiDeps.source, session }).id ?? '';

  if (transcript.isPending) {
    return (
      <p role="status" className="text-[12.5px]" style={muted} data-call-transcript="loading">
        {translate(language, 'callTranscript.loading')}
      </p>
    );
  }
  if (transcript.isError) {
    return (
      <p role="status" className="flex items-center gap-2 text-[12.5px]" style={muted} data-call-transcript="error">
        {translate(language, 'callTranscript.error')}
        <button type="button" className="min-h-11 rounded-chip px-3 font-semibold" style={{ color: 'var(--accent)' }} onClick={() => void transcript.refetch()}>
          {translate(language, 'callTranscript.retry')}
        </button>
      </p>
    );
  }
  const lines = transcript.data === null ? [] : transcriptLines(transcript.data, { viewerId, languages });
  const notes = transcript.data === null ? [] : transcriptNotes(transcript.data);
  if (lines.length === 0 && notes.length === 0) {
    return (
      <p role="status" className="text-[12.5px]" style={muted} data-call-transcript="empty">
        {translate(language, 'callTranscript.empty')}
      </p>
    );
  }
  return <CallTranscriptLines lines={lines} notes={notes} language={language} original={original} onToggleOriginal={toggleOriginal} />;
}

type LinesProps = {
  readonly lines: readonly TranscriptLine[];
  readonly notes?: readonly TranscriptNote[];
  readonly language: InterfaceLanguage;
  readonly original: boolean;
  readonly onToggleOriginal?: () => void;
};

function NoteItem({ note, language }: { readonly note: TranscriptNote; readonly language: InterfaceLanguage }) {
  return (
    <li data-call-transcript-note={note.kind}>
      <span className="flex justify-between gap-3 text-[13.5px]" style={muted} dir={noteDirection(language)} data-call-transcript-note-text="">
        <span>
          <JournalNoteSentence note={note} language={language} ink={{ className: 'author-ink', style: authorInkStyle({ authorId: note.userId ?? '', name: note.name ?? '' }) }} />
        </span>
        <span className="text-mini font-semibold tabular-nums">{formatCallJournalClock(note.offsetMs / 1000)}</span>
      </span>
    </li>
  );
}

const PRIMARY_SWAP = { 'data-call-transcript-swap': 'primary' } as const;

const SECONDARY_SWAP = { 'data-call-transcript-swap': 'secondary' } as const;

const SECONDARY_MARKER = { original: 'data-call-transcript-original-line', translated: 'data-call-transcript-translated-line' } as const;

/**
 * Une phrase : sa ligne EN TÊTE et, s'il y a une traduction, l'autre DESSOUS (`transcriptReading`).
 * La traduction en tête prend la couleur d'auteur, l'original en tête l'encre du thème ; la ligne
 * dessous, qu'elle dise « Original · » ou « Traduit · », est la même pièce à l'encre secondaire du fil.
 */
function SentenceItem({ line, language, inverted }: { readonly line: TranscriptLine; readonly language: InterfaceLanguage; readonly inverted: boolean }) {
  const name = line.mine ? translate(language, 'message.author.self') : (line.speakerName ?? translate(language, 'callCaptions.participant'));
  const ink = authorInkStyle({ authorId: line.speakerId, name: line.speakerName ?? '' });
  const { primary, secondary } = transcriptReading(line, inverted);
  const primaryInk = primary.kind === 'translated' ? { className: 'author-ink block text-[13.5px]', style: ink } : { className: 'block text-[13.5px]', style: { color: 'var(--color-ios-ink)' } };
  return (
    <li data-call-transcript-line={line.mine ? 'mine' : 'peer'}>
      <span className="flex justify-between gap-3 text-mini font-semibold" style={muted}>
        <span className="author-ink" style={ink}>{name}</span>
        <span className="tabular-nums">{formatCallJournalClock(line.offsetMs / 1000)}</span>
      </span>
      <span {...primaryInk} dir="auto" lang={primary.language} data-call-transcript-text={primary.kind} {...(secondary === null ? {} : PRIMARY_SWAP)}>
        {primary.text}
      </span>
      {secondary === null ? null : <UnfoldedOriginal open text={secondary.text} from={secondary.language} language={language} label={secondary.kind} marker={SECONDARY_MARKER[secondary.kind]} ink={THREAD_SECONDARY_INK} attrs={SECONDARY_SWAP} />}
    </li>
  );
}

export function CallTranscriptLines({ lines, notes = [], language, original, onToggleOriginal }: LinesProps) {
  const translatedSome = lines.some((line) => line.translated);
  const entries = transcriptEntries(lines, notes);
  const section = useTranscriptSwapFade(original);
  return (
    <section ref={section} aria-label={translate(language, 'callTranscript.title')} className="flex w-full flex-col gap-2 text-start" data-call-transcript="lines">
      <ol className="flex flex-col gap-2">
        {entries.map((entry) => (entry.type === 'note' ? <NoteItem key={entry.note.id} note={entry.note} language={language} /> : <SentenceItem key={entry.line.id} line={entry.line} language={language} inverted={original} />))}
      </ol>
      {translatedSome && onToggleOriginal !== undefined ? (
        <button type="button" aria-pressed={original} className="min-h-11 self-start rounded-chip px-3 text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }} onClick={onToggleOriginal} data-call-transcript-original="">
          {translate(language, original ? 'callTranscript.showTranslated' : 'callTranscript.showOriginal')}
        </button>
      ) : null}
    </section>
  );
}
