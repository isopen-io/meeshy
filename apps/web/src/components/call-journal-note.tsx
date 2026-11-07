import type { CallCaptureEventKind } from '@meeshy/shared/types/call-capture';
import type { CSSProperties } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **UNE CAPTURE, DITE DANS LE JOURNAL** (#16665, loi 13) — « Awa a capturé
 * l'écran », « Awa enregistre l'écran », « L'enregistrement de l'appel a
 * commencé » ou « … s'est arrêté ». La phrase est à l'encre SECONDAIRE et ne
 * prend jamais de couleur d'auteur ; seul le pseudo garde la sienne (loi 4).
 * Partagée par le Journal vivant, le bandeau des sous-titres et le journal
 * d'après l'appel : chacun remet l'encre du pseudo propre à son fond.
 */

export type JournalNoteView = { readonly kind: CallCaptureEventKind; readonly name: string | null };

const SENTENCE = {
  screenshot: 'callJournal.capture.screenshot',
  recording: 'callJournal.capture.recording',
} as const;

const ACTION = {
  screenshot: 'callJournal.capture.screenshot.action',
  recording: 'callJournal.capture.recording.action',
} as const;

const MOMENT = {
  'call-recording-started': 'callJournal.recording.started',
  'call-recording-stopped': 'callJournal.recording.stopped',
} as const;

const NAME_SLOT = '\u0000';

const nameOf = (language: InterfaceLanguage, note: JournalNoteView): string => note.name ?? translate(language, 'callCaptions.participant');

type NameInk = { readonly style: CSSProperties; readonly className?: string };

function Name({ text, ink }: { readonly text: string; readonly ink: NameInk }) {
  return (
    <strong className={ink.className} style={ink.style} data-call-journal-note-name="">
      {text}
    </strong>
  );
}

/** La phrase entière, le pseudo à sa place dans la langue (« Awa a capturé l'écran », « التقط Awa … »). */
export function JournalNoteSentence({ note, language, ink }: { readonly note: JournalNoteView; readonly language: InterfaceLanguage; readonly ink: NameInk }) {
  if (note.kind === 'call-recording-started' || note.kind === 'call-recording-stopped') return <>{translate(language, MOMENT[note.kind])}</>;
  const [before = '', after = ''] = translate(language, SENTENCE[note.kind], { name: NAME_SLOT }).split(NAME_SLOT);
  return (
    <>
      {before}
      <Name text={nameOf(language, note)} ink={ink} />
      {after}
    </>
  );
}

/** La forme du bandeau (R1) : « Karim · a capturé l'écran », le pseudo et son point à sa couleur. */
export function JournalNoteCaption({ note, language, ink }: { readonly note: JournalNoteView; readonly language: InterfaceLanguage; readonly ink: NameInk }) {
  if (note.kind === 'call-recording-started' || note.kind === 'call-recording-stopped') return <>{translate(language, MOMENT[note.kind])}</>;
  return (
    <>
      <Name text={`${nameOf(language, note)} · `} ink={ink} />
      {translate(language, ACTION[note.kind])}
    </>
  );
}
