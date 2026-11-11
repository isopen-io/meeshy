import { memo, useCallback, useEffect, useState } from 'react';

import { JournalNoteCaption, noteDirection } from '@/components/call-journal-note';
import { UnfoldedOriginal } from '@/components/call-unfolded-original';
import { TypingDots } from '@/components/typing-dots';
import { CAPTIONS_OVERLAY_LINES, captionLanguageLabel, captionText, isAwaitingTranslation, type CallCaption, type CaptionsMode } from '@/lib/calls/call-captions';
import { callCaptionsFooter, callCaptionsFooterLabel, captionFooterLine, EVENT_FOOTER_LINE } from '@/lib/calls/call-captions-footer';
import { overlayEntries, type CallJournalNote } from '@/lib/calls/call-journal-notes';
import { CAPTIONS_EXIT, PILL_TEXT_EXIT, PILL_TEXT_LEAVING } from '@/lib/calls/call-pill-text-exit';
import { formatCallClock, type ActiveCall } from '@/lib/calls/call-store';
import { useRailFade } from '@/lib/calls/use-mode-motion';
import { useRailPresence } from '@/lib/calls/use-rail-presence';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import '@/styles/call-captions.css';

/**
 * **LES SOUS-TITRES D'UN APPEL** (#8048, #8393, #17343) — les deux dernières
 * lignes dites (`CallTranscriptionOverlay` d'iOS), puis un PIED : à gauche la
 * paire de langues de la dernière phrase traduite et comment voir l'original
 * (« EN → FR · toucher = original »), à droite le bouton « Journal » (#17346),
 * qui ouvre tout l'appel à leur place. Ils vivent DANS la pilule, au-dessus de
 * sa rangée de base, dans le même verre (`surface="inset"` : le verre est celui
 * de la pilule, jamais un verre sur du verre) ; `(…)` les range, refermer les
 * actions les rend. Ils ne prennent un verre à eux (`surface="glass"`) que
 * pilule rangée d'un toucher, ou sous un mode (Effets, Montage). Chunk à part :
 * l'écran d'appel n'en paie que l'`import()` ; il le monte dès que l'appel vit
 * (et le précharge de toute façon quand le navigateur souffle).
 *
 * RIEN NE PART D'UN COUP (#17406) : `CallCaptionsSlot` pose les sous-titres à leur
 * place (dans la pilule, ou seuls à sa place) et les y RETIENT le temps d'un fondu
 * vers la rangée de base quand `(…)` les range ou que la pilule revient — inertes,
 * cachés au lecteur d'écran, à la largeur du verre qui porte du texte. L'écran
 * d'appel ne fait que les garder montés : la sortie vit ici, hors de son chunk.
 *
 * Le nom de chaque personne porte SA couleur (`call-speaker-color.ts`), la
 * même que le liseré de sa vignette dans la grille ; ma ligne se dit « Moi ».
 * L'original part tout de suite, étiqueté de sa langue (« EN ») quand elle est
 * hors du Prisme du lecteur, avec trois points tant qu'une traduction est
 * attendue (`TRANSLATION_WAIT_MS`) ; la traduction le remplace sur place, et
 * l'étiquette devient « EN → FR » — le Prisme dit discrètement qu'il a agi. Un
 * toucher sur la phrase déplie « Original · … » sous elle. TOUTE la bande
 * retient son toucher (`data-call-chrome-keep`) : sur une scène vidéo, toucher
 * une phrase, une capture ou sa marge ne range plus les commandes (planche P5). Tout l'appel se
 * relit dans le Journal (#8579, `call-journal-panel.tsx`), ouvert depuis la
 * rangée « L'appel » : le bandeau ne montre que le direct.
 *
 * Accessibilité : la région est `aria-live` POLIE, mais une ligne encore en
 * révision y est `aria-hidden` — un lecteur d'écran annonce la phrase dite, pas
 * chaque mot corrigé. Tout texte dit porte `dir="auto"` : une phrase arabe se
 * lit de droite à gauche même sous une interface française.
 *
 * Une capture d'écran y passe à son heure (#16665, vue R1) : « Karim · a
 * capturé l'écran · 12:40 » — le pseudo à sa couleur, le reste à l'encre
 * secondaire, l'heure de l'appel au bout ; de même le début et la fin de
 * l'enregistrement consenti, sans pseudo.
 */

/**
 * Les trois points d'attente : l'atome de la frappe (`TypingDots`), à l'encre secondaire.
 * Ils arrivent et retombent en fondu (`PILL_TEXT_EXIT`, `call-motion.css`) ; pendant qu'ils
 * repartent, le lecteur d'écran n'entend déjà plus l'attente.
 */
function WaitingDots({ waiting, label }: { readonly waiting: boolean; readonly label: string }) {
  const present = useRailPresence(waiting, PILL_TEXT_EXIT).mounted;
  if (!present) return null;
  return (
    <>
      <span className="ms-1.5 inline-flex align-middle" data-call-caption-waiting="" {...(waiting ? {} : { 'data-leaving': '' })}>
        <TypingDots color={INK_2} />
      </span>
      {waiting ? <span className="sr-only">{`, ${label}`}</span> : null}
    </>
  );
}

/** Rend le composant à l'échéance de la prochaine attente : l'attente retombe, l'étiquette de la langue reste. */
function useWaitingClock(deadlines: readonly (number | null)[]): number {
  const [, wake] = useState(0);
  const now = Date.now();
  const next = Math.min(...deadlines.map((until) => (until !== null && until > now ? until : Number.POSITIVE_INFINITY)));
  useEffect(() => {
    if (!Number.isFinite(next)) return undefined;
    const handle = setTimeout(() => wake((tick) => tick + 1), Math.max(0, next - Date.now()));
    return () => clearTimeout(handle);
  }, [next]);
  return now;
}

/** L'encre d'une phrase ORIGINALE : seule une traduction prend la couleur de son auteur (`docs/product/appels-vue-finale.md` loi 4). */
const INK = 'var(--color-on-media)';

const INK_2 = 'var(--color-on-media-3)';

const NOTE_KEY = { listening: 'callCaptions.listening', unsupported: 'callCaptions.unsupported', denied: 'callCaptions.denied', sealed: 'callCaptions.sealed' } as const;

export type CaptionsSurface = 'glass' | 'inset';

/**
 * La couleur d'un locuteur, REMISE par l'écran d'appel (`call-speaker-color.ts`)
 * plutôt qu'importée : ce chunk à part n'importe rien de statique du chunk de
 * l'écran d'appel (`budgets.json` › `call_overlay.dynamic_only`).
 */
export type SpeakerColorOf = (who: Pick<CallCaption, 'speakerId' | 'speakerName'>) => string;

function NoteLine({ note, language, color, clock }: { readonly note: CallJournalNote; readonly language: InterfaceLanguage; readonly color: string; readonly clock: string | null }) {
  return (
    <p className="py-1" dir={noteDirection(language)} style={{ color: INK_2 }} data-call-caption-note={note.kind}>
      <JournalNoteCaption note={note} language={language} ink={{ style: { color } }} />
      {clock === null ? null : ` · ${clock}`}
    </p>
  );
}

/**
 * Une phrase qui arrive ne redessine que sa ligne : les autres se comparent par
 * ce qu'elles MONTRENT (la phrase, le mode, le nom, la couleur, l'état déplié) ;
 * l'action reçoit l'identifiant, elle ne change pas d'un rendu à l'autre.
 */
const CaptionLine = memo(function CaptionLine({
  caption,
  mode,
  speaker,
  color,
  open,
  waiting,
  language,
  onToggle,
}: {
  readonly caption: CallCaption;
  readonly mode: CaptionsMode;
  readonly speaker: string;
  readonly color: string;
  readonly open: boolean;
  readonly waiting: boolean;
  readonly language: InterfaceLanguage;
  readonly onToggle: (id: string) => void;
}) {
  const shown = captionText(caption, mode);
  const languages = captionLanguageLabel(caption, mode);
  const unfoldable = shown !== caption.original;
  const content = (
    <>
      <strong style={{ color }}>{speaker} · </strong>
      <span dir="auto" style={{ color: unfoldable ? color : INK }}>
        {shown}
      </span>
      {languages === null ? null : (
        <span className="ms-1.5 inline-block rounded px-1 align-middle text-check font-semibold tracking-wide" style={{ color: INK_2, border: `1px solid ${INK_2}` }} data-call-caption-languages="">
          {languages}
        </span>
      )}
      <WaitingDots waiting={waiting} label={translate(language, 'callCaptions.translating')} />
    </>
  );
  return (
    <div aria-hidden={caption.isFinal ? undefined : true} style={caption.isFinal ? undefined : { opacity: 0.7 }} data-call-caption={caption.mine ? 'mine' : 'peer'}>
      {unfoldable ? (
        <button type="button" aria-expanded={open} onClick={() => onToggle(caption.id)} className="block min-h-11 w-full text-start" data-call-caption-line={caption.id}>
          {content}
        </button>
      ) : (
        <p className="py-1" data-call-caption-line={caption.id}>
          {content}
        </p>
      )}
      <UnfoldedOriginal open={unfoldable && open} original={caption.original} from={caption.pair?.from} language={language} marker="data-call-caption-original" />
    </div>
  );
});

type PanelProps = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly colorOf: SpeakerColorOf;
  readonly surface?: CaptionsSurface;
  /** Ouvre tout l'appel à la place des sous-titres : absent, le bouton « Journal » n'est pas posé. */
  readonly onOpenJournal?: (() => void) | undefined;
};

/** Où les sous-titres se posent : dans le verre de la pilule (`captions`) ou seuls, à sa place (`captionsAlone`). */
export type CaptionsSlot = 'captions' | 'captionsAlone';

/**
 * Les sous-titres à leur place, et leur sortie : `shown` faux, ils restent le temps
 * du fondu (`CAPTIONS_EXIT`), puis ne laissent rien. Revenus pendant le fondu,
 * ce sont les mêmes, aussitôt. Sous « Réduire les animations », le moteur joue
 * l'arrivée et le départ en fondu court (`useRailFade`), là où la feuille ne peut plus.
 */
export function CallCaptionsSlot({ slot, shown, ...panel }: Omit<PanelProps, 'surface'> & { readonly slot: CaptionsSlot; readonly shown: boolean }) {
  const present = useRailPresence(shown, CAPTIONS_EXIT).mounted;
  const fade = useRailFade<HTMLDivElement>(shown);
  if (!present) return null;
  const leaving = shown ? {} : PILL_TEXT_LEAVING;
  return slot === 'captions' ? (
    <div ref={fade} className="pt-1" data-call-pill-text="captions" {...leaving}>
      <CallCaptionsPanel {...panel} surface="inset" />
      <hr className="mx-2 my-1 border-0 border-t border-media-hairline" />
    </div>
  ) : (
    <div ref={fade} data-call-pill-text="captionsAlone" {...leaving}>
      <CallCaptionsPanel {...panel} surface="glass" />
    </div>
  );
}

export function CallCaptionsPanel({ call, language, colorOf, surface = 'glass', onOpenJournal }: PanelProps) {
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(() => new Set());
  const mode = call.captionsMode;
  const lines = overlayEntries(call.captions, call.journalNotes ?? [], CAPTIONS_OVERLAY_LINES);
  const clockOf = (at: number): string | null => (call.connectedAt === null ? null : formatCallClock((at - call.connectedAt) / 1000));
  const note = call.transcription === 'idle' ? null : NOTE_KEY[call.transcription];
  const speaker = (caption: CallCaption): string => (caption.mine ? translate(language, 'callCaptions.self') : caption.speakerName !== '' ? caption.speakerName : translate(language, 'callCaptions.participant'));
  const toggle = useCallback((id: string) => setUnfolded((current) => (current.has(id) ? new Set([...current].filter((entry) => entry !== id)) : new Set([...current, id]))), []);
  const now = useWaitingClock(lines.map((entry) => (entry.type === 'note' ? null : (entry.caption.origin?.awaitingUntil ?? null))));
  const footer = callCaptionsFooter(lines.map((entry) => (entry.type === 'note' ? EVENT_FOOTER_LINE : captionFooterLine(entry.caption, mode, now))));
  const footerText = footer === null ? null : callCaptionsFooterLabel(language, footer);

  return (
    <section
      aria-label={translate(language, 'callCaptions.regionLabel')}
      className={`${surface === 'glass' ? 'glass-call-prominent rounded-card ' : ''}flex flex-col gap-1.5 px-3 py-2`}
      data-call-captions-panel={mode}
      data-call-captions-surface={surface}
      data-call-chrome-keep=""
    >
      <div aria-live="polite" className="flex flex-col text-body" data-call-caption-lines="">
        {lines.length === 0 ? (
          <p style={{ color: INK_2 }}>{translate(language, 'callCaptions.waiting')}</p>
        ) : (
          lines.map((entry) =>
            entry.type === 'note' ? (
              <NoteLine key={entry.note.id} note={entry.note} language={language} color={colorOf({ speakerId: entry.note.userId ?? '', speakerName: entry.note.name ?? '' })} clock={clockOf(entry.at)} />
            ) : (
              <CaptionLine key={entry.caption.id} caption={entry.caption} mode={mode} speaker={speaker(entry.caption)} color={colorOf(entry.caption)} open={unfolded.has(entry.caption.id)} waiting={isAwaitingTranslation(entry.caption, now)} language={language} onToggle={toggle} />
            ),
          )
        )}
      </div>
      {footerText === null && note === null && onOpenJournal === undefined ? null : (
        <div className="flex items-center justify-between gap-x-3 text-mini" style={{ color: INK_2 }} data-call-captions-footer="">
          <div className="flex min-w-0 flex-col">
            {footerText === null || footer === null ? null : (
              <span className="truncate" data-call-captions-footer-state={footer.kind} {...(footer.kind === 'touchForOriginal' ? { 'data-call-captions-pair': footer.pair } : {})}>
                {footerText}
              </span>
            )}
            {note === null ? null : <span data-call-captions-note={call.transcription}>{translate(language, note)}</span>}
          </div>
          {onOpenJournal === undefined ? null : (
            <button type="button" onClick={onOpenJournal} className="glass-call-disc min-h-11 shrink-0 rounded-full px-4 font-semibold transition-transform active:scale-95 motion-reduce:transition-none" style={{ color: INK }} data-call-captions-journal="">
              {translateCallControls(language, 'callControls.journal')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
