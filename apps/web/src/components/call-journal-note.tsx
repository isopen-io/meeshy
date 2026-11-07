import type { CallCaptureEventKind } from '@meeshy/shared/types/call-capture';
import type { CSSProperties } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { interfaceDirection } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **UNE CAPTURE, DITE DANS LE JOURNAL** (#16665, loi 13) — « Awa a capturé
 * l'écran », « Awa enregistre l'écran », « L'enregistrement de l'appel a
 * commencé » ou « … s'est arrêté ». La phrase est à l'encre SECONDAIRE et ne
 * prend jamais de couleur d'auteur ; seul le pseudo garde la sienne (loi 4).
 * Partagée par le Journal vivant, le bandeau des sous-titres et le journal
 * d'après l'appel : chacun remet l'encre du pseudo propre à son fond.
 *
 * Une note est une phrase de l'INTERFACE, pas une parole : son hôte lui donne
 * la direction de la langue d'interface (`noteDirection`), jamais `dir="auto"`,
 * qui la lirait depuis le pseudo.
 */

export const noteDirection = (language: InterfaceLanguage): 'rtl' | 'ltr' => interfaceDirection(language);

export type JournalNoteView = { readonly kind: CallCaptureEventKind; readonly name: string | null };

/** L'action seule : la phrase se compose « pseudo action » dans les sept langues, et le bandeau « pseudo · action ». */
const ACTION = {
  screenshot: 'callJournal.capture.screenshot',
  recording: 'callJournal.capture.recording',
} as const;

const MOMENT = {
  'call-recording-started': 'callJournal.recording.started',
  'call-recording-stopped': 'callJournal.recording.stopped',
} as const;

const nameOf = (language: InterfaceLanguage, note: JournalNoteView): string => note.name ?? translate(language, 'callCaptions.participant');

type NameInk = { readonly style: CSSProperties; readonly className?: string };

/** Le pseudo isolé (`<bdi>`) : un nom latin dans une phrase arabe, ou l'inverse, garde sa place. */
function Name({ text, suffix, ink }: { readonly text: string; readonly suffix?: string; readonly ink: NameInk }) {
  return (
    <strong className={ink.className} style={ink.style} data-call-journal-note-name="">
      <bdi>{text}</bdi>
      {suffix}
    </strong>
  );
}

/** La phrase entière : « Awa a capturé l'écran ». */
export function JournalNoteSentence({ note, language, ink }: { readonly note: JournalNoteView; readonly language: InterfaceLanguage; readonly ink: NameInk }) {
  if (note.kind === 'call-recording-started' || note.kind === 'call-recording-stopped') return <>{translate(language, MOMENT[note.kind])}</>;
  return (
    <>
      <Name text={nameOf(language, note)} ink={ink} /> {translate(language, ACTION[note.kind])}
    </>
  );
}

/** La forme du bandeau (R1) : « Karim · a capturé l'écran », le pseudo et son point à sa couleur. */
export function JournalNoteCaption({ note, language, ink }: { readonly note: JournalNoteView; readonly language: InterfaceLanguage; readonly ink: NameInk }) {
  if (note.kind === 'call-recording-started' || note.kind === 'call-recording-stopped') return <>{translate(language, MOMENT[note.kind])}</>;
  return (
    <>
      <Name text={nameOf(language, note)} suffix=" · " ink={ink} />
      {translate(language, ACTION[note.kind])}
    </>
  );
}
