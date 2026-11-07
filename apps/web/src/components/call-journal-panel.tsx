import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { JournalNoteSentence } from '@/components/call-journal-note';
import { CallPanelFrame, type PanelBack } from '@/components/call-panel-frame';
import { captionLanguageLabel, captionText, type CallCaption } from '@/lib/calls/call-captions';
import { journalEntries, type CallJournalNote } from '@/lib/calls/call-journal-notes';
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
 */

const INK = 'var(--color-on-media)';

const INK_2 = 'var(--color-on-media-3)';

const NEAR_BOTTOM = 24;

type JournalProps = {
  readonly id: string;
  readonly closeGlyph: ReactNode;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly back?: PanelBack | undefined;
  readonly captions: readonly CallCaption[];
  readonly notes: readonly CallJournalNote[];
  readonly colorOf: (who: Pick<CallCaption, 'speakerId' | 'speakerName'>) => string;
  /** Les sous-titres sont coupés : rien ne s'inscrit, et l'état vide propose de les activer. */
  readonly listening: boolean;
  readonly onListen: () => void;
};

const atBottom = (list: HTMLElement): boolean => list.scrollHeight - list.scrollTop - list.clientHeight <= NEAR_BOTTOM;

export function CallJournalPanel({ id, closeGlyph, language, onClose, back, captions, notes, colorOf, listening, onListen }: JournalProps) {
  const list = useRef<HTMLOListElement>(null);
  const stuck = useRef(true);
  const [away, setAway] = useState(false);
  const clock = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const speaker = (caption: CallCaption): string => (caption.mine ? translate(language, 'message.author.self') : caption.speakerName !== '' ? caption.speakerName : translate(language, 'callCaptions.participant'));
  const last = captions.at(-1);
  const entries = journalEntries(captions, notes);

  useLayoutEffect(() => {
    const element = list.current;
    if (element !== null && stuck.current) element.scrollTop = element.scrollHeight;
  }, [entries.length, last?.original, last?.translated]);

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
    <CallPanelFrame id={id} title={t(language, 'callControls.journal')} closeLabel={t(language, 'callControls.close')} closeGlyph={closeGlyph} onClose={onClose} back={back} data={{ 'data-call-journal-panel': '' }}>
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
        <div className="relative">
          <ol
            ref={list}
            aria-label={translate(language, 'callCaptions.journal.title')}
            onScroll={onScroll}
            tabIndex={0}
            className="flex flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-2"
            style={{ maxHeight: 'min(28rem, calc(100dvh - 20rem))' }}
            data-call-journal=""
            data-panel-first=""
          >
            {entries.map((entry) => {
              if (entry.type === 'note') {
                const { note } = entry;
                return (
                  <li key={note.id} className="flex flex-col gap-0.5" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 48px' }} data-call-journal-note={note.kind}>
                    <time className="text-mini" style={{ color: INK_2 }} dateTime={new Date(note.at).toISOString()}>
                      {clock.format(note.at)}
                    </time>
                    <span className="text-body" style={{ color: INK_2 }} dir="auto" data-call-journal-note-text="">
                      <JournalNoteSentence note={note} language={language} ink={{ style: { color: colorOf({ speakerId: note.userId ?? '', speakerName: note.name ?? '' }) } }} />
                    </span>
                  </li>
                );
              }
              const { caption } = entry;
              const served = captionText(caption, 'translated');
              const languages = captionLanguageLabel(caption, 'translated');
              const color = colorOf(caption);
              return (
                <li key={caption.id} className="flex flex-col gap-0.5" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 64px', opacity: caption.isFinal ? 1 : 0.7 }} data-call-journal-entry={caption.mine ? 'mine' : 'peer'}>
                  <span className="text-mini" style={{ color: INK_2 }}>
                    <strong style={{ color }}>{speaker(caption)}</strong> · <time dateTime={new Date(caption.at).toISOString()}>{clock.format(caption.at)}</time>
                    {languages === null ? null : <span className="ms-1.5 text-check font-semibold tracking-wide">{languages}</span>}
                  </span>
                  <span className="text-body" style={{ color: served === caption.original ? INK : color }} dir="auto" data-call-journal-text="">
                    {served}
                  </span>
                  {served === caption.original ? null : (
                    <span className="text-mini" style={{ color: INK_2 }} data-call-journal-original="">
                      <span className="font-semibold">{t(language, 'callControls.journal.original')} · </span>
                      <span dir="auto" lang={caption.pair?.from}>
                        {caption.original}
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
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
    </CallPanelFrame>
  );
}
