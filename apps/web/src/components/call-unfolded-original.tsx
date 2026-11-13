import { noteDirection } from '@/components/call-journal-note';
import { PILL_TEXT_EXIT, PILL_TEXT_LEAVING } from '@/lib/calls/call-pill-text-exit';
import { useRailPresence } from '@/lib/calls/use-rail-presence';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import '@/styles/call-unfolded-original.css';

/**
 * « Original · … » déplié sous la phrase touchée (#17340), le même dans la bande
 * et dans le journal : il en descend, et y remonte en fondu, inerte, avant de ne
 * rien laisser (`PILL_TEXT_EXIT`, `call-unfolded-original.css`). `marker` est
 * l'attribut de repère de la surface qui le porte (`data-call-caption-original`,
 * `data-call-journal-original`). `ink` est l'encre de la surface : celle du verre
 * d'appel (`--color-on-media-3`) dans la bande et le journal vivant, l'encre secondaire
 * du FIL (`--color-ios-ink-2`) dans le journal d'après l'appel, posé sur le fond du fil
 * (#17878, A2.3).
 */
export const CALL_GLASS_INK = 'var(--color-on-media-3)';

export const THREAD_SECONDARY_INK = 'var(--color-ios-ink-2)';

export function UnfoldedOriginal({ open, original, from, language, marker, ink = CALL_GLASS_INK }: { readonly open: boolean; readonly original: string; readonly from: string | undefined; readonly language: InterfaceLanguage; readonly marker: string; readonly ink?: string }) {
  const present = useRailPresence(open, PILL_TEXT_EXIT).mounted;
  if (!present) return null;
  return (
    <span className="block ps-3 text-mini" style={{ color: ink }} dir={noteDirection(language)} data-call-unfolded-original="" {...{ [marker]: '' }} {...(open ? {} : PILL_TEXT_LEAVING)}>
      {`${translateCallControls(language, 'callControls.journal.original')} · `}
      <span dir="auto" lang={from} data-call-original-text="">
        {original}
      </span>
    </span>
  );
}
