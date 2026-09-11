import type { SystemRow } from '@/lib/view/message-badges';
import { systemRowText } from '@/lib/view/message-badges';
import { META_TEXT_OPACITY } from '@/lib/reading-mode/metrics';

import { Glyph, GlyphSvg } from './glyph';
import { THREAD_STATES_GLYPHS } from './glyphs-thread-states';
import { THREAD_IDENTITY_GLYPHS } from './glyphs-thread-identity';

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
export function SystemNotice({
  row,
  timeString,
  surface,
}: {
  readonly row: SystemRow;
  readonly timeString: string;
  readonly surface: 'row' | 'bubble';
}) {
  const label = systemRowText(row);
  const content = <SystemNoticeContent row={row} />;
  /* LA TEINTE (revue-correction #5936, défaut majeur 5) — `--color-ios-ink-2`
     à `META_TEXT_OPACITY` (0,55), le cran MÉTA déjà dérivé et déjà tenu pour
     AA ailleurs dans le fil (`.focal-meta`, `EditedMark`), JAMAIS
     `--color-meta` (0,50, le littéral que la régression F-083 avait laissé) :
     mesuré 2,44:1 (heure, clair) / 3,98:1 (texte) — sous AA dans les QUATRE
     runs, l'heure à un fantôme quasi invisible. `--color-ios-ink-2` seul
     n'est appliqué QU'UNE fois ici (pas de second `× 0.7` sur l'heure comme
     avant : une opacité composée deux fois assombrissait l'heure PLUS que le
     texte qu'elle précède). */
  /* L'HEURE PRÉCÈDE TOUJOURS LE TEXTE, sur les DEUX peaux
     (`BubbleSystemNoticeView.swift:107-113`/`BubbleJoinNoticeView.swift`,
     `FocalSystemNoticeRow.swift`) : « un message système est un JALON du
     fil, pas une parole » — même sous la capsule des Bulles, iOS grave
     l'heure AU-DESSUS d'elle, jamais dedans. */
  const time = (
    <time
      className="text-[9.5px] font-semibold"
      style={{ color: 'var(--color-ios-ink-2)', opacity: META_TEXT_OPACITY }}
      aria-hidden
    >
      {timeString}
    </time>
  );

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
    </div>
  );
}

/** Le contenu visuel — glyphe (appel, avis d'arrivée) puis texte. */
function SystemNoticeContent({ row }: { readonly row: SystemRow }) {
  if (row.kind === 'call') {
    return (
      <>
        {row.callType === 'video' ? (
          <GlyphSvg glyph={THREAD_STATES_GLYPHS.videoCamera} size={13} />
        ) : (
          <Glyph name="phone" size={13} />
        )}
        <span>{row.text}</span>
      </>
    );
  }
  if (row.kind === 'join') {
    return (
      <>
        {row.isAnonymous ? (
          <GlyphSvg glyph={THREAD_IDENTITY_GLYPHS.maskHappy} size={13} style={{ color: 'var(--ios-purple-500)' }} />
        ) : (
          <GlyphSvg glyph={THREAD_STATES_GLYPHS.userPlus} size={13} />
        )}
        <span>{systemRowText(row)}</span>
        {row.handle !== null ? <span style={{ opacity: 0.85 }}>{row.handle}</span> : null}
        {row.isAnonymous ? (
          <span
            className="rounded-chip px-1.5 py-0.5 text-[10.5px] font-semibold"
            style={{ color: 'var(--ios-purple-500)', backgroundColor: 'color-mix(in srgb, var(--ios-purple-500) 12%, transparent)' }}
          >
            sans compte
          </span>
        ) : null}
      </>
    );
  }
  return <span>{row.text}</span>;
}
