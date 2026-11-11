import { noteDirection } from '@/components/call-journal-note';
import { PILL_TEXT_EXIT, PILL_TEXT_LEAVING } from '@/lib/calls/call-pill-text-exit';
import { useRailPresence } from '@/lib/calls/use-rail-presence';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * « Original · … » déplié sous la phrase touchée (#17340), le même dans la bande
 * et dans le journal : il en descend, et y remonte en fondu, inerte, avant de ne
 * rien laisser (`PILL_TEXT_EXIT`). `marker` est l'attribut de repère de la surface
 * qui le porte (`data-call-caption-original`, `data-call-journal-original`).
 */
export function UnfoldedOriginal({ open, original, from, language, marker }: { readonly open: boolean; readonly original: string; readonly from: string | undefined; readonly language: InterfaceLanguage; readonly marker: string }) {
  const present = useRailPresence(open, PILL_TEXT_EXIT).mounted;
  if (!present) return null;
  return (
    <span className="block ps-3 text-mini" style={{ color: 'var(--color-on-media-3)' }} dir={noteDirection(language)} {...{ [marker]: '' }} {...(open ? {} : PILL_TEXT_LEAVING)}>
      {`${translateCallControls(language, 'callControls.journal.original')} · `}
      <span dir="auto" lang={from} data-call-original-text="">
        {original}
      </span>
    </span>
  );
}
