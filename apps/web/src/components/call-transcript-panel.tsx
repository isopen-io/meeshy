import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useStore } from 'zustand/react';

import { JournalNoteSentence, noteDirection } from '@/components/call-journal-note';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { formatCallClock } from '@/lib/calls/call-store';
import { callTranscriptQueryKey, loadCallTranscript, transcriptEntries, transcriptLines, transcriptNotes, type TranscriptLine, type TranscriptNote } from '@/lib/calls/call-transcript';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { authorInkStyle } from '@/lib/view/author-ink';
import { useReaderLanguages } from '@/lib/view/use-reader';

/**
 * **LA TRANSCRIPTION D'UN APPEL, DANS SA BULLE** (#8048, G6) — dépliée sous la
 * bulle d'appel du fil (`system-notice.tsx`), chargée au toucher (chunk à part)
 * depuis `GET /calls/:callId/transcript`. Miroir de la section « Transcription »
 * de `CallSummaryDetailSheet` d'iOS : le locuteur, l'heure dans l'appel, la
 * ligne servie par le Prisme du lecteur, et « Voir l'original » qui rend ce
 * qui a été dit. Gardée en cache par sa clé : la rouvrir ne recharge rien.
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

export function CallTranscriptPanel({ callId, language }: { readonly callId: string; readonly language: InterfaceLanguage }) {
  const session = useStore(sessionStore, (state) => state.session);
  const { languages } = useReaderLanguages();
  const [original, setOriginal] = useState(false);
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
  return <CallTranscriptLines lines={lines} notes={notes} language={language} original={original} onToggleOriginal={() => setOriginal((value) => !value)} />;
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
        <span className="text-mini font-semibold tabular-nums">{formatCallClock(note.offsetMs / 1000)}</span>
      </span>
    </li>
  );
}

export function CallTranscriptLines({ lines, notes = [], language, original, onToggleOriginal }: LinesProps) {
  const translatedSome = lines.some((line) => line.translated);
  const entries = transcriptEntries(lines, notes);
  return (
    <section aria-label={translate(language, 'callTranscript.title')} className="flex w-full max-w-[560px] flex-col gap-2 rounded-card px-3 py-2 text-start" style={{ background: 'color-mix(in srgb, var(--color-ios-ink-2) 8%, transparent)' }} data-call-transcript="lines">
      <ol className="flex flex-col gap-2">
        {entries.map((entry) => {
          if (entry.type === 'note') return <NoteItem key={entry.note.id} note={entry.note} language={language} />;
          const { line } = entry;
          const name = line.mine ? translate(language, 'message.author.self') : (line.speakerName ?? translate(language, 'callCaptions.participant'));
          const ink = authorInkStyle({ authorId: line.speakerId, name: line.speakerName ?? '' });
          return (
            <li key={line.id} data-call-transcript-line={line.mine ? 'mine' : 'peer'}>
              <span className="flex justify-between gap-3 text-mini font-semibold" style={muted}>
                <span className="author-ink" style={ink}>{name}</span>
                <span className="tabular-nums">{formatCallClock(line.offsetMs / 1000)}</span>
              </span>
              {!original && line.translated ? (
                <span className="author-ink block text-[13.5px]" style={ink} dir="auto" lang={line.language || undefined} data-call-transcript-text="translated">
                  {line.text}
                </span>
              ) : (
                <span className="block text-[13.5px]" style={{ color: 'var(--color-ios-ink)' }} dir="auto" data-call-transcript-text="original">
                  {line.original}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {translatedSome && onToggleOriginal !== undefined ? (
        <button type="button" aria-pressed={original} className="min-h-11 self-start rounded-chip px-3 text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }} onClick={onToggleOriginal} data-call-transcript-original="">
          {translate(language, original ? 'callTranscript.showTranslated' : 'callTranscript.showOriginal')}
        </button>
      ) : null}
    </section>
  );
}
