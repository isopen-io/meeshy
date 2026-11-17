import '@/styles/kit-note.css';
import '@/styles/kit-motion.css';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  meeshyNoteRecipe,
  meeshyNoteStyle,
  type MeeshyNoteForm,
  type MeeshyNoteKind,
  type MeeshyNoteLeadKind,
  type MeeshyNoteSize,
} from './meeshy-note-recipe';

export * from './meeshy-note-recipe';

export type MeeshyNoteLead = { readonly glyph: ReactNode } | MeeshyNoteLeadKind;

export type MeeshyNoteProps = {
  readonly text: string;
  readonly emphasis?: string | undefined;
  readonly form?: MeeshyNoteForm | undefined;
  readonly kind?: MeeshyNoteKind | undefined;
  readonly lead?: MeeshyNoteLead | undefined;
  readonly detail?: string | undefined;
  readonly isStale?: boolean | undefined;
  readonly tint?: string | undefined;
  readonly announces?: boolean | undefined;
  readonly action?: ReactNode;
  readonly alignment?: 'leading' | 'center' | undefined;
  readonly label?: string | undefined;
  readonly size?: MeeshyNoteSize | undefined;
  readonly isList?: boolean | undefined;
  readonly className?: string | undefined;
};

const svg = (paths: ReactNode): ReactNode => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const DEFAULT_GLYPH: Readonly<Record<MeeshyNoteKind, ReactNode>> = {
  neutral: svg(<><circle cx="8" cy="8" r="5.5" /><path d="M8 7.5V11M8 5.2v.1" /></>),
  info: svg(<><circle cx="8" cy="8" r="5.5" /><path d="M8 7.5V11M8 5.2v.1" /></>),
  ok: svg(<><circle cx="8" cy="8" r="5.5" /><path d="m5.5 8.2 1.7 1.7 3.3-3.6" /></>),
  warn: svg(<><path d="M8 2.8 14 13H2L8 2.8Z" /><path d="M8 6.8v3M8 11.6v.1" /></>),
  security: svg(<path d="M8 2 13 4v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4l5-2Z" />),
};

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const leadKindOf = (lead: MeeshyNoteLead | undefined): MeeshyNoteLeadKind | undefined => (lead === undefined ? undefined : typeof lead === 'string' ? lead : 'glyph');

const withEmphasis = (text: string, emphasis: string | undefined): ReactNode => {
  if (emphasis === undefined || emphasis === '') return text;
  const at = text.indexOf(emphasis);
  if (at < 0) return text;
  return (
    <Fragment>
      {text.slice(0, at)}
      <strong>{emphasis}</strong>
      {text.slice(at + emphasis.length)}
    </Fragment>
  );
};

/**
 * L'annonce d'arrivée : la région existe vide, puis reçoit la phrase quand la note
 * PASSE à un sens annoncé (à son arrivée, ou d'info à warn). Une phrase qui change
 * sans changer de sens n'est pas réécrite ; un retour au calme vide la région.
 */
const useArrivalAnnouncement = (announces: boolean, spoken: string): string => {
  const [said, setSaid] = useState('');
  const wasAnnouncing = useRef(false);
  useEffect(() => {
    if (announces && !wasAnnouncing.current) setSaid(spoken);
    if (!announces) setSaid('');
    wasAnnouncing.current = announces;
  }, [announces, spoken]);
  return said;
};

function Lead({ kind, lead, isPulsing, glyph }: { readonly kind: MeeshyNoteKind; readonly lead: MeeshyNoteLeadKind; readonly isPulsing: boolean; readonly glyph: ReactNode }) {
  if (lead === 'none') return null;
  const isDot = lead === 'dot' || lead === 'pulse';
  return (
    <span className="kit-note__lead" aria-hidden="true" data-kit-note-lead="" data-dot={isDot ? '' : undefined} data-pulse={isDot ? String(isPulsing) : undefined}>
      {isDot ? null : (glyph ?? DEFAULT_GLYPH[kind])}
    </span>
  );
}

/**
 * Une note : tête, phrase et seconde ligne se lisent en UN élément ; l'action de fin
 * reste un bouton à part. Seul `warn` est dit à son arrivée, une fois, poliment, sans
 * voler le focus, par une région à part qui ne relit ni l'action ni les phrases
 * suivantes ; les autres sens ne sont jamais annoncés. `label` remplace la phrase à
 * la voix (texte réservé, jamais un `aria-label` sur un div sans rôle). Le sens est
 * toujours doublé par un glyphe et par les mots.
 */
export function MeeshyNote({ text, emphasis, form, kind, lead, detail, isStale, tint, announces, action, alignment = 'leading', label, size, isList, className }: MeeshyNoteProps) {
  if (text === '') throw new Error('MeeshyNote : la phrase est obligatoire et déjà traduite.');
  const recipe = meeshyNoteRecipe({ form, kind, lead: leadKindOf(lead), size, isList, isStale, hasDetail: detail !== undefined && detail !== '', hasAction: action !== undefined && action !== null, reduceMotion: prefersReducedMotion(), announces, tint });
  const glyph = typeof lead === 'object' ? lead.glyph : undefined;
  const hasLabel = label !== undefined && label !== '';
  const said = useArrivalAnnouncement(recipe.announces, hasLabel ? label : text);
  return (
    <div
      className={className === undefined ? 'kit-note' : `kit-note ${className}`}
      style={meeshyNoteStyle(recipe, tint)}
      data-kit-note=""
      data-form={recipe.form}
      data-kind={recipe.kind}
      data-alignment={alignment}
      {...(recipe.animatesHeight ? { 'data-enters': '' } : {})}
    >
      <div className="kit-note__body" data-kit-note-body="">
        <Lead kind={recipe.kind} lead={recipe.lead} isPulsing={recipe.isPulsing} glyph={glyph} />
        <div className="kit-note__text" {...(hasLabel ? { 'aria-hidden': 'true' as const } : {})}>
          <span className="kit-note__phrase">{withEmphasis(text, emphasis)}</span>
          {recipe.showsDetail ? <span className="kit-note__detail">{detail}</span> : null}
        </div>
        {hasLabel ? <span className="sr-only">{label}</span> : null}
      </div>
      {action === undefined || action === null ? null : <div className="kit-note__action">{action}</div>}
      <span className="sr-only" role="status" aria-live="polite" data-kit-note-announce="">
        {said}
      </span>
    </div>
  );
}

export type MeeshyNoteItem = { readonly glyph?: ReactNode; readonly text: string };

export type MeeshyNoteListProps = {
  readonly items: readonly MeeshyNoteItem[];
  readonly kind?: MeeshyNoteKind | undefined;
  readonly size?: MeeshyNoteSize | undefined;
  readonly label?: string | undefined;
};

/** Une liste de notes courtes : elle annonce son nombre de lignes. */
export function MeeshyNoteList({ items, kind, size = 'regular', label }: MeeshyNoteListProps) {
  const recipe = meeshyNoteRecipe({ form: 'line', kind, size, isList: true });
  return (
    <div className="kit-note-list" role="list" aria-label={label} data-count={String(items.length)} style={meeshyNoteStyle(recipe, undefined)}>
      {items.map((item, index) => (
        <div key={`${index}-${item.text}`} className="kit-note-list__item" role="listitem">
          <Lead kind={recipe.kind} lead="glyph" isPulsing={false} glyph={item.glyph} />
          <span className="kit-note__phrase">{item.text}</span>
        </div>
      ))}
    </div>
  );
}
