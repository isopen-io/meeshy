import type { TranscriptLine } from '@/lib/calls/call-transcript';

/**
 * **LA BASCULE « VOIR L'ORIGINAL » DU JOURNAL D'APRÈS L'APPEL** (#17897, loi 7 de
 * `docs/product/appels-vue-finale.md`, décision porteur #17862) — la loi pure : l'état de la
 * bascule dit quelle ligne d'une phrase est EN TÊTE et laquelle est DESSOUS.
 *
 * Par défaut, la traduction est en tête et « Original · … » dessous ; « Voir l'original »
 * INVERSE les deux (l'original en tête, « Traduit · … » dessous) pour tout l'appel, et « Voir la
 * traduction » rend l'état par défaut. Rien ne disparaît. Une phrase sans traduction (la
 * mienne, ou celle qui est déjà dans la langue du lecteur) reste SEULE dans les deux états : il
 * n'y a rien à inverser. Même bascule que le journal vivant (P6, `CallJournalViewSwitch`).
 */

export type ReadingKind = 'translated' | 'original';

/** Un texte et la langue qu'il parle (`undefined` quand elle est inconnue : aucun attribut `lang`). */
export type ReadingTrack = { readonly kind: ReadingKind; readonly text: string; readonly language: string | undefined };

export type TranscriptReading = { readonly primary: ReadingTrack; readonly secondary: ReadingTrack | null };

export type ReadableLine = Pick<TranscriptLine, 'original' | 'originalLanguage' | 'text' | 'language' | 'translated'>;

const languageOf = (code: string): string | undefined => (code === '' ? undefined : code);

export function transcriptReading(line: ReadableLine, inverted: boolean): TranscriptReading {
  const original: ReadingTrack = { kind: 'original', text: line.original, language: languageOf(line.originalLanguage) };
  if (!line.translated) return { primary: original, secondary: null };
  const translated: ReadingTrack = { kind: 'translated', text: line.text, language: languageOf(line.language) };
  return inverted ? { primary: original, secondary: translated } : { primary: translated, secondary: original };
}
