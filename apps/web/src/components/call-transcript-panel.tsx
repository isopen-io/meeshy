import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useStore } from 'zustand/react';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { formatCallClock } from '@/lib/calls/call-store';
import { callTranscriptQueryKey, loadCallTranscript, transcriptLines } from '@/lib/calls/call-transcript';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useReaderLanguages } from '@/lib/view/use-reader';

/**
 * **LA TRANSCRIPTION D'UN APPEL, DANS SA BULLE** (#8048, G6) — dépliée sous la
 * bulle d'appel du fil (`system-notice.tsx`), chargée au toucher (chunk à part)
 * depuis `GET /calls/:callId/transcript`. Miroir de la section « Transcription »
 * de `CallSummaryDetailSheet` d'iOS : le locuteur, l'heure dans l'appel, la
 * ligne servie par le Prisme du lecteur, et « Voir l'original » qui rend ce
 * qui a été dit. Gardée en cache par sa clé : la rouvrir ne recharge rien.
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
  if (lines.length === 0) {
    return (
      <p role="status" className="text-[12.5px]" style={muted} data-call-transcript="empty">
        {translate(language, 'callTranscript.empty')}
      </p>
    );
  }
  const translatedSome = lines.some((line) => line.translated);
  return (
    <section aria-label={translate(language, 'callTranscript.title')} className="flex w-full max-w-[560px] flex-col gap-2 rounded-card px-3 py-2 text-start" style={{ background: 'color-mix(in srgb, var(--color-ios-ink-2) 8%, transparent)' }} data-call-transcript="lines">
      <ol className="flex flex-col gap-2">
        {lines.map((line) => (
          <li key={line.id} data-call-transcript-line={line.mine ? 'mine' : 'peer'}>
            <span className="flex justify-between gap-3 text-[11px] font-semibold" style={muted}>
              <span>{line.mine ? translate(language, 'message.author.self') : (line.speakerName ?? translate(language, 'callCaptions.participant'))}</span>
              <span className="tabular-nums">{formatCallClock(line.offsetSec)}</span>
            </span>
            <span className="block text-[13.5px]" style={{ color: 'var(--color-ios-ink)' }} dir="auto" lang={original ? undefined : line.language || undefined}>
              {original ? line.original : line.text}
            </span>
          </li>
        ))}
      </ol>
      {translatedSome ? (
        <button type="button" aria-pressed={original} className="min-h-11 self-start rounded-chip px-3 text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }} onClick={() => setOriginal((value) => !value)} data-call-transcript-original="">
          {translate(language, original ? 'callTranscript.showTranslated' : 'callTranscript.showOriginal')}
        </button>
      ) : null}
    </section>
  );
}
