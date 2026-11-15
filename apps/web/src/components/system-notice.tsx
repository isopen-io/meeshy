import type { CallNoticeTarget } from '@/lib/calls/call-notice';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import type { SystemRow } from '@/lib/view/message-badges';
import { systemRowLabel, systemRowText } from '@/lib/view/message-badges';
import { META_TEXT_OPACITY } from '@/lib/reading-mode/metrics';

import { withoutTrailingInvite } from '@/lib/view/arrival-greeting';

import { ArrivalGreetingInvite, useArrivalGreeting } from './arrival-greeting-invite';
import { CallNotice } from './call-notice-card';
import { GlyphSvg } from './glyph';
import { THREAD_STATES_GLYPHS } from './glyphs-thread-states';
import { THREAD_IDENTITY_GLYPHS } from './glyphs-thread-identity';
import { SystemNoticeTime } from './system-notice-time';

/**
 * LA RANGÉE SYSTÈME — un message qui n'est PAS une prise de parole (#5936).
 *
 * `FocalSystemRows.swift` : rangée PLATE, centrée, SANS capsule ; l'heure
 * gravée EN PREMIER, puis le texte. `BubbleSystemViews.swift` : la MÊME
 * disposition, mais le texte porte une CAPSULE (`.system-notice`,
 * `thread-system.css`, copie littérale de `BubbleSystemViews.swift:120-130`).
 * `deleted`/`burned` restent au domicile de `ProtectionNotice` (D-23) — cette
 * vue ne les redit pas.
 *
 * `role="status"` NON POSÉ (ce n'est pas une annonce vivante — un message
 * système arrive comme tout autre message, sous `message:new`) ; le
 * conteneur porte `aria-label` (D-32 §11, « une rangée se lit d'un seul
 * libellé »), ses enfants sont `aria-hidden`.
 */
type SystemNoticeProps = {
  readonly row: SystemRow;
  readonly timeString: string;
  readonly surface: 'row' | 'bubble';
  readonly callTarget?: CallNoticeTarget | null;
  /** Le prisme du lecteur — la piste et la transcription de l'enregistrement d'appel s'y résolvent (#8064). */
  readonly languages?: readonly string[];
  /** La langue d'INTERFACE de la rangée — celle du document par défaut. */
  readonly language?: InterfaceLanguage;
};

/** Un appel est une CARTE (#17878, A1.2) ; tout autre message système, une rangée ou une capsule. */
export function SystemNotice(props: SystemNoticeProps) {
  const { row, timeString, callTarget = null, languages = [], language = currentInterfaceLanguage() } = props;
  if (row.kind === 'call') return <CallNotice row={row} timeString={timeString} callTarget={callTarget} languages={languages} language={language} />;
  return <PlainSystemNotice {...props} />;
}

function PlainSystemNotice({ row, timeString, surface, language = currentInterfaceLanguage() }: SystemNoticeProps) {
  const label = systemRowLabel(row, language);
  /* « DIS-LUI SALUT » (#16338) — sous la phrase, comme « Rappeler » : un bouton nommé, jamais caché sous `aria-hidden`. */
  const greeting = useArrivalGreeting(row);
  const action = greeting !== null ? <ArrivalGreetingInvite greeting={greeting} language={language} /> : null;
  const content = <SystemNoticeContent row={row} language={language} invitesApart={greeting !== null} />;
  const time = <SystemNoticeTime timeString={timeString} />;

  if (surface === 'row') {
    return (
      <div data-system={row.kind} className="flex flex-col items-center gap-[3px] text-center" aria-label={label}>
        {time}
        <span
          className="text-[12.5px] font-medium"
          style={{ color: 'var(--color-ios-ink-2)', opacity: META_TEXT_OPACITY }}
          aria-hidden
        >
          {content}
        </span>
        {action}
      </div>
    );
  }

  return (
    <div data-system={row.kind} className="flex flex-col items-center gap-[3px]" aria-label={label}>
      {time}
      <span
        className="system-notice inline-flex items-center gap-1.5 text-[12.5px] font-medium"
        style={{ color: 'var(--color-ios-ink-2)', opacity: META_TEXT_OPACITY }}
        aria-hidden
      >
        {content}
      </span>
      {action}
    </div>
  );
}

/** Le contenu visuel — glyphe (appel, avis d'arrivée, arrivées regroupées) puis texte. */
function SystemNoticeContent({
  row,
  language,
  invitesApart = false,
}: {
  readonly row: SystemRow;
  readonly language: InterfaceLanguage;
  /** L'invite « dis-leur salut » est un bouton à part : la phrase ne la répète pas (#16338). */
  readonly invitesApart?: boolean;
}) {
  if (row.kind === 'join') {
    return (
      <>
        {row.isAnonymous ? (
          <span data-join-guest="" className="inline-flex">
            <GlyphSvg glyph={THREAD_IDENTITY_GLYPHS.maskHappy} size={13} style={{ color: 'var(--ios-purple-500)' }} />
          </span>
        ) : (
          <GlyphSvg glyph={THREAD_STATES_GLYPHS.userPlus} size={13} />
        )}
        {/* Même raison que l'espace du handle, juste dessous (#10101) : sur
            la peau `row`, le glyphe se collait à la phrase. */}
        {' '}
        <span>{systemRowText(row, language)}</span>
        {/* L'ESPACE EST ÉCRITE (#9710) : sur la peau `row`, ces morceaux ne
            vivent pas dans une boîte flexible, et rien d'autre ne les sépare —
            « joined the conversation@ano_Emma ». Dans la capsule flexible, une
            espace seule entre deux éléments n'est pas rendue. */}
        {row.handle !== null ? (
          <>
            {' '}
            <span style={{ opacity: 0.85 }}>{row.handle}</span>
          </>
        ) : null}
        {/* LE MASQUE SUFFIT (#10101) : la pastille « sans compte » qui le
            répétait à côté du nom a quitté la rangée. Le lecteur d'écran,
            lui, l'entend dans le nom accessible (`systemRowLabel`). */}
      </>
    );
  }
  /* L'avis de capture d'un INVITÉ porte le masque de l'avis d'arrivée (#9617) ;
     la phrase dit déjà « (invité) », le glyphe le montre sans le redire. */
  if (row.kind === 'capture') {
    return (
      <>
        {row.notice.actor.isAnonymous ? (
          <span data-capture-guest="" className="inline-flex">
            <GlyphSvg glyph={THREAD_IDENTITY_GLYPHS.maskHappy} size={13} style={{ color: 'var(--ios-purple-500)' }} />
          </span>
        ) : null}
        <span>{systemRowText(row, language)}</span>
      </>
    );
  }
  if (row.kind === 'arrivals') {
    return (
      <>
        <GlyphSvg glyph={THREAD_STATES_GLYPHS.userPlus} size={13} />
        <span>{invitesApart ? withoutTrailingInvite(systemRowText(row, language)) : systemRowText(row, language)}</span>
      </>
    );
  }
  return <span>{systemRowText(row, language)}</span>;
}
