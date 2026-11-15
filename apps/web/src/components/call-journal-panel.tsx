import { memo, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { JournalNoteSentence, noteDirection } from '@/components/call-journal-note';
import { CallJournalToggle } from '@/components/call-journal-toggle';
import { CallJournalViewSwitch, type JournalView } from '@/components/call-journal-view-switch';
import { CallPanelFrame, type ColumnPanelHead, type PlainPillPanelHead } from '@/components/call-panel-frame';
import { UnfoldedOriginal } from '@/components/call-unfolded-original';
import { CAPTIONS_OVERLAY_LINES, captionLanguageLabel, captionReveal, captionText, revealState, type CallCaption } from '@/lib/calls/call-captions';
import { callCaptionsFooter, callCaptionsFooterLabel, captionFooterLine, EVENT_FOOTER_LINE } from '@/lib/calls/call-captions-footer';
import { useCaptionReveals } from '@/lib/calls/call-captions-unfold-store';
import { journalEntries, type CallJournalEntry, type CallJournalNote } from '@/lib/calls/call-journal-notes';
import { journalClock } from '@/lib/calls/call-journal-clock';
import { callJournalHeight, journalPlan, type JournalStage } from '@/lib/calls/call-journal-height';
import { translateCallControls as t } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE JOURNAL DE L'APPEL** (#8579) — « Journal », dans la rangée « L'appel »,
 * ouvre À LA PLACE des rangées tout ce qui a été dit depuis le début de
 * l'appel, sans rien tronquer : qui, quand, la phrase servie dans ma langue
 * (le Prisme) et, dessous, son original quand il diffère. Le journal survit à
 * l'appel réduit, aux sous-titres coupés et à une reconnexion : il vit dans
 * l'état de l'appel (`ActiveCall.captions`), pas dans ce panneau.
 *
 * Le défilement est LIBRE : tant que je suis en bas, chaque phrase nouvelle
 * m'y garde ; dès que je remonte relire, plus rien ne me déplace, et « Revenir
 * au direct » me ramène en bas. Chaque ligne porte `content-visibility: auto` :
 * un appel de trois heures ne se peint que là où je regarde.
 *
 * Chunk à part (`budgets.json` › `call_journal_panel`) : il n'importe rien de
 * l'écran d'appel, qui lui remet la couleur de chaque personne. Cette couleur
 * teint TOUJOURS le nom, et la phrase seulement quand elle est TRADUITE ; une
 * phrase originale (la mienne comprise) reste à l'encre de l'appel, et
 * l'original déplié dessous à l'encre secondaire (#16634,
 * `docs/product/appels-vue-finale.md` loi 4).
 *
 * Une capture d'écran et les moments de l'enregistrement consenti y entrent à
 * leur heure (#16665, loi 13) : une ligne datée, la phrase à l'encre
 * secondaire, le pseudo seul à sa couleur.
 *
 * DANS la pilule, il a la tête et le pied d'iOS : « Journal » au bord de tête et
 * la bascule Traduit · Original au bord de fin, sans ‹ ni ✕ (P6.3, P9b.4, #17928) ;
 * à son pied, ce que disent les dernières phrases (comme le pied des sous-titres)
 * et « Journal » en disque blanc, qui le referme (#17964, `call-journal-toggle.tsx`).
 * En colonne, il n'a pas de pied : « Journal », au pied de la bande, la referme.
 */

const INK = 'var(--color-on-media)';

const INK_2 = 'var(--color-on-media-3)';

const NEAR_BOTTOM = 24;

const COLUMN_HEAD: ColumnPanelHead = { fill: true };

const PILL_HEAD: PlainPillPanelHead = { plain: true };

const FOLDED_HEAD: PlainPillPanelHead = { plain: true, folded: true };

type JournalBase = {
  readonly id: string;
  /** L'appel dont c'est le journal : ses phrases dépliées lui survivent fermé, et rien n'en passe à un autre appel (L3.9). */
  readonly callId: string;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly captions: readonly CallCaption[];
  readonly notes: readonly CallJournalNote[];
  readonly colorOf: (who: Pick<CallCaption, 'speakerId' | 'speakerName'>) => string;
  /** Le début de l'appel (`ActiveCall.connectedAt`) : chaque ligne se date DANS l'appel (`m:ss`), jamais à l'heure murale ; sans lui, aucune heure. */
  readonly startedAt: number | null;
  /** Les sous-titres sont coupés : rien ne s'inscrit, et l'état vide propose de les activer. */
  readonly listening: boolean;
  readonly onListen: () => void;
};

/** Dans la pilule : la hauteur de la fenêtre, dont la liste prend une part (`callJournalHeight`, #17343). Ni ‹ ni ✕ : « Journal », au pied, le referme (#17964). */
/** `stage` : l'avatar compact du duo audio au-dessus de la pilule, et si les écarts sont resserrés (#18488) — le journal ne prend que ce qu'il reste autour d'eux. */
type JournalInPill = { readonly fill?: false; readonly windowHeight?: number; readonly stage?: JournalStage | undefined };

/** Posé dans la colonne du grand écran (#16942) : la liste prend toute la hauteur, et la tête n'a ni ‹ ni ✕ (#17932). */
type JournalProps = JournalBase & (JournalInPill | ColumnPanelHead);

/** L'heure dans l'appel, au bout (à droite) de la ligne méta ; absente quand le début de l'appel est inconnu. */
function CallClock({ at, startedAt }: { readonly at: number; readonly startedAt: number | null }) {
  const label = journalClock(at, startedAt);
  return label === null ? null : (
    <time className="shrink-0 tabular-nums" dateTime={new Date(at).toISOString()} data-call-journal-clock="">
      {label}
    </time>
  );
}

/* Une ligne qui arrive ne redessine que la sienne : chaque ligne se compare par ce qu'elle MONTRE (sa phrase, son nom, sa couleur, la vue, l'heure dans l'appel). */
const JournalNoteLine = memo(function JournalNoteLine({ note, language, startedAt, colorOf }: { readonly note: CallJournalNote; readonly language: InterfaceLanguage; readonly startedAt: number | null; readonly colorOf: JournalProps['colorOf'] }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-mini" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 32px' }} data-call-journal-note={note.kind}>
      <span className="text-body" style={{ color: INK_2 }} dir={noteDirection(language)} data-call-journal-note-text="">
        <JournalNoteSentence note={note} language={language} ink={{ style: { color: colorOf({ speakerId: note.userId ?? '', speakerName: note.name ?? '' }) } }} />
      </span>
      <CallClock at={note.at} startedAt={startedAt} />
    </li>
  );
});

type CaptionLineProps = {
  readonly caption: CallCaption;
  readonly view: JournalView;
  readonly language: InterfaceLanguage;
  readonly startedAt: number | null;
  readonly speaker: string;
  readonly color: string;
  readonly open: boolean;
  readonly onToggle: (id: string) => void;
};

const JournalCaptionLine = memo(function JournalCaptionLine({ caption, view, language, startedAt, speaker, color, open, onToggle }: CaptionLineProps) {
  const reveal = captionReveal(caption, view, open);
  const served = captionText(caption, reveal.mode);
  const languages = captionLanguageLabel(caption, reveal.mode);
  const content = (
    <>
      <span className="flex items-baseline justify-between gap-3 text-mini" style={{ color: INK_2 }}>
        <span data-call-journal-who="">
          <strong style={{ color }}>{speaker}</strong>
          {languages === null ? null : <span className="ms-1.5 text-check font-semibold tracking-wide">{languages}</span>}
        </span>
        <CallClock at={caption.at} startedAt={startedAt} />
      </span>
      <span className="text-body" style={{ color: served !== caption.original ? color : INK }} dir="auto" data-call-journal-text="">
        {served}
      </span>
    </>
  );
  return (
    <li className="flex flex-col gap-0.5" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 64px', opacity: caption.isFinal ? 1 : 0.7 }} data-call-journal-entry={caption.mine ? 'mine' : 'peer'}>
      {reveal.canReveal ? (
        <button type="button" {...revealState(view, open)} onClick={() => onToggle(caption.id)} className="flex min-h-11 w-full flex-col gap-0.5 text-start" data-call-journal-line={caption.id}>
          {content}
        </button>
      ) : (
        content
      )}
      <UnfoldedOriginal open={reveal.originalBelow} text={caption.original} from={caption.pair?.from} language={language} marker="data-call-journal-original" />
    </li>
  );
});

/** Ce que disent les dernières phrases, lues dans la vue du journal : la paire et le geste, ou les langues comptées. Le journal ne guette aucune attente — il dit ce qui est traduit. */
function footLabel(entries: readonly CallJournalEntry[], view: JournalView, revealed: ReadonlySet<string>, language: InterfaceLanguage): string | null {
  const lines = entries.slice(-CAPTIONS_OVERLAY_LINES).map((entry) => (entry.type === 'note' ? EVENT_FOOTER_LINE : captionFooterLine(entry.caption, captionReveal(entry.caption, view, revealed.has(entry.caption.id)).mode, Number.POSITIVE_INFINITY)));
  const footer = callCaptionsFooter(lines);
  return footer === null ? null : callCaptionsFooterLabel(language, footer);
}

/** Le pied du journal dans la pilule (P6, P9b) : à gauche ce que disent les dernières phrases, à droite « Journal » actif, qui le referme. */
function JournalFoot({ label, language, onClose, views }: { readonly label: string | null; readonly language: InterfaceLanguage; readonly onClose: () => void; readonly views: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-x-3 px-3 text-mini" style={{ color: INK_2 }} data-call-journal-foot="">
      <span className="min-w-0 truncate">{label}</span>
      {views}
      <CallJournalToggle language={language} on onPress={onClose} marker="data-call-journal-toggle" />
    </div>
  );
}

/** La liste du journal dans la pilule : une part de la fenêtre (`callJournalHeight`), et jamais plus que ce que la fenêtre laisse sous l'en-tête et au-dessus de son pied (« Journal », 3rem) et de la rangée de base. */
const listSize = (windowHeight: number | undefined, plan: { readonly list: number } | null): CSSProperties =>
  windowHeight === undefined ? { maxHeight: 'min(28rem, calc(100dvh - 23rem))' } : plan !== null ? { height: `${plan.list}px` } : { height: `${callJournalHeight(windowHeight)}px`, maxHeight: 'max(8rem, calc(100dvh - 20rem))' };

const atBottom = (list: HTMLElement): boolean => list.scrollHeight - list.scrollTop - list.clientHeight <= NEAR_BOTTOM;

export function CallJournalPanel(props: JournalProps) {
  const { id, callId, language, onClose, captions, notes, colorOf, listening, onListen, startedAt } = props;
  const fill = props.fill === true;
  const list = useRef<HTMLOListElement>(null);
  const stuck = useRef(true);
  const [away, setAway] = useState(false);
  const [view, setView] = useState<JournalView>('translated');
  const { revealed, toggle } = useCaptionReveals(callId, 'journal');
  const speaker = (caption: CallCaption): string => (caption.mine ? translate(language, 'callCaptions.self') : caption.speakerName !== '' ? caption.speakerName : translate(language, 'callCaptions.participant'));
  const last = captions.at(-1);
  const entries = journalEntries(captions, notes);
  /* #18488 : dans le duo audio d'une fenêtre basse, la liste ne prend que ce qu'il reste autour de l'avatar compact et de la pilule ; sans place pour une phrase, la tête se replie dans le pied. */
  const plan = fill || props.windowHeight === undefined || props.stage === undefined ? null : journalPlan(props.windowHeight, props.stage);
  const views = <CallJournalViewSwitch language={language} view={view} onChange={setView} />;

  useLayoutEffect(() => {
    const element = list.current;
    if (element !== null && stuck.current) element.scrollTop = element.scrollHeight;
  }, [entries.length, last?.original, last?.translated, revealed]);

  const onScroll = (): void => {
    const element = list.current;
    if (element === null) return;
    stuck.current = atBottom(element);
    setAway(!stuck.current);
  };

  const backToLive = (): void => {
    const element = list.current;
    if (element === null) return;
    stuck.current = true;
    setAway(false);
    element.scrollTo?.({ top: element.scrollHeight, behavior: 'smooth' });
    if (element.scrollTo === undefined) element.scrollTop = element.scrollHeight;
  };

  return (
    <CallPanelFrame
      id={id}
      title={t(language, 'callControls.journal')}
      onClose={onClose}
      {...(fill ? COLUMN_HEAD : plan?.folded === true ? FOLDED_HEAD : PILL_HEAD)}
      trailing={plan?.folded === true ? null : views}
      data={{ 'data-call-journal-panel': '' }}
    >
      {entries.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-3 pb-2" data-call-journal-empty="">
          <p className="text-body" style={{ color: INK_2 }}>
            {t(language, 'callControls.journal.empty')}
          </p>
          {listening ? null : (
            <button type="button" onClick={onListen} className="min-h-11 rounded-full bg-on-media px-4 text-mini font-semibold text-[var(--ios-indigo-950)]" data-call-journal-listen="">
              {translate(language, 'call.captions.on')}
            </button>
          )}
        </div>
      ) : (
        <div className={fill ? 'relative flex min-h-0 flex-1 flex-col' : 'relative'}>
          <ol
            ref={list}
            aria-label={translate(language, 'callCaptions.journal.title')}
            onScroll={onScroll}
            tabIndex={0}
            className={`flex flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-2 ${fill ? 'min-h-0 flex-1' : ''}`}
            style={props.fill === true ? undefined : listSize(props.windowHeight, plan)}
            data-call-journal=""
            data-panel-first=""
          >
            {entries.map((entry) =>
              entry.type === 'note' ? (
                <JournalNoteLine key={entry.note.id} note={entry.note} language={language} startedAt={startedAt} colorOf={colorOf} />
              ) : (
                <JournalCaptionLine key={entry.caption.id} caption={entry.caption} view={view} language={language} startedAt={startedAt} speaker={speaker(entry.caption)} color={colorOf(entry.caption)} open={revealed.has(entry.caption.id)} onToggle={toggle} />
              ),
            )}
          </ol>
          {away ? (
            <button
              type="button"
              onClick={backToLive}
              className="absolute bottom-3 left-1/2 min-h-11 -translate-x-1/2 rounded-full bg-on-media px-4 text-mini font-semibold text-[var(--ios-indigo-950)] shadow-lg"
              data-call-journal-live=""
            >
              {t(language, 'callControls.journal.live')}
            </button>
          ) : null}
        </div>
      )}
      {fill ? null : <JournalFoot label={footLabel(entries, view, revealed, language)} language={language} onClose={onClose} views={plan?.folded === true ? views : null} />}
    </CallPanelFrame>
  );
}

/** Le journal en colonne de verre sur grand écran (#16942, W1 et W2) : la même liste, qui prend toute la hauteur de la colonne que l'écran pose (`call-screen.tsx`, `JOURNAL_COLUMN_PLACE`), pour qu'elle entre et reparte par le bord de fin (W1.20). */
export function CallJournalInColumn(journal: JournalBase) {
  return <CallJournalPanel {...journal} fill />;
}
