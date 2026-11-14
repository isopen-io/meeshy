import type { CallJournalNote } from './call-journal-notes';
import type { CallMember } from './call-store';

/**
 * **UNE SEULE PUCE DE CAPTURE** (R1.2, #17963 ; `CallCaptureLedger.alert` d'iOS, `flash ?? recorders.last`, et
 * `CallCaptureViews.kt` d'Android) — quand plusieurs personnes capturent, la puce dit la capture la plus récente :
 * celle que le journal a notée en dernier parmi celles qui capturent encore, sinon la dernière arrivée qui capture.
 * Celui qui capture ne la voit pas : je ne suis pas un membre de mon appel, et ma capture entre au journal.
 */
export function captureAlertOf(members: Readonly<Record<string, CallMember>>, notes: readonly CallJournalNote[]): CallMember | null {
  const capturing = Object.values(members).filter((member) => member.capturing);
  const latest = notes
    .filter((note) => (note.kind === 'screenshot' || note.kind === 'recording') && capturing.some((member) => member.userId === note.userId))
    .reduce<CallJournalNote | null>((best, note) => (best === null || note.at >= best.at ? note : best), null);
  return capturing.find((member) => member.userId === latest?.userId) ?? capturing.at(-1) ?? null;
}
