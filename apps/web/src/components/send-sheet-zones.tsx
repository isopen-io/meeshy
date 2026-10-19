import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

import type { PublishFormat } from '@/lib/send/send-sheet-plan';

import { Glyph, GlyphSvg } from './glyph';
import { SEND_SHEET_GLYPHS } from './glyphs-send-sheet';
import type { CommunityRow, RecipientRow } from './send-sheet-model';
import { PUBLISH_GLYPH, RecentTile, RecipientLine, SectionTitle, SelectedChip } from './send-sheet-parts';
import { BUTTON, GLYPH_SIZE } from './ui-chrome';

/**
 * LES QUATRE ZONES DE L'ÉCRAN DE PARTAGE (#10948, planche « Anatomie ») —
 * toujours dans cet ordre : CE QUI PART, CE QU'ON PEUT EN FAIRE, À QUI, puis la
 * barre ENVOYER. Des vues sans décision : chacune reçoit ses libellés déjà
 * traduits et ce que la loi a rendu.
 */

const MUTED = { color: 'var(--color-ios-ink-2)' } as const;

/** Une ligne grise de motif — ce que l'écran dit au lieu de rendre une action interdite. */
export function ReasonLine({ children, tone = 'muted' }: { readonly children: ReactNode; readonly tone?: 'muted' | 'warning' }) {
  return (
    <p
      data-send-reason={tone}
      className="flex items-start gap-1.5 px-4 pt-2 text-caption"
      style={tone === 'warning' ? { color: 'var(--color-ios-ink)' } : MUTED}
    >
      {tone === 'warning' ? <Glyph name="lock" size={GLYPH_SIZE.sm} /> : null}
      <span>{children}</span>
    </p>
  );
}

/* ─── 1. CE QUI PART ─────────────────────────────────────────────────────── */

export type PieceLabels = {
  readonly name: (index: number, count: number) => string;
  readonly remove: (name: string) => string;
  readonly earlier: string;
  readonly later: string;
};

/** Les vignettes locales des fichiers, rendues au démontage. */
function useObjectUrls(files: readonly File[]): readonly (string | undefined)[] {
  const [urls, setUrls] = useState<readonly (string | undefined)[]>([]);
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return;
    const made = files.map((file) => (file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : undefined));
    setUrls(made);
    return () => made.forEach((url) => (url === undefined ? undefined : URL.revokeObjectURL(url)));
  }, [files]);
  return urls;
}

/**
 * LES PIÈCES, DANS L'ORDRE D'ENVOI — la croix retire, « Avancer » / « Reculer »
 * réordonnent sans glisser (accessibilité). En RTL, la rangée se lit de droite
 * à gauche d'elle-même. Les pièces au-delà des plafonds sont MARQUÉES (V9).
 */
export function PieceStrip({
  files,
  sizeLabel,
  overflowFrom,
  labels,
  disabled,
  onRemove,
  onMove,
}: {
  readonly files: readonly File[];
  /** Le poids d'une pièce, dans la langue du lecteur. */
  readonly sizeLabel: (bytes: number) => string;
  /** Index de la première pièce qui dépasse les plafonds ; `files.length` si tout tient. */
  readonly overflowFrom: number;
  readonly labels: PieceLabels;
  readonly disabled: boolean;
  readonly onRemove: (index: number) => void;
  readonly onMove: (index: number, by: -1 | 1) => void;
}) {
  const urls = useObjectUrls(files);
  return (
    <ol className="send-sheet-pieces flex gap-2 overflow-x-auto px-4 pb-1" data-send-pieces={files.length}>
      {files.map((file, index) => {
        const name = labels.name(index + 1, files.length);
        const over = index >= overflowFrom;
        const url = urls[index];
        return (
          <li key={`${file.name}-${file.size}-${index}`} className="relative shrink-0" data-send-piece={index} data-over={over ? '' : undefined} aria-label={`${name} — ${file.name}`}>
            <span
              className="grid size-16 place-items-center overflow-hidden rounded-tile"
              style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink-3)', outline: over ? '2px solid var(--color-error)' : undefined }}
            >
              {url !== undefined && file.type.startsWith('image/') ? <img src={url} alt="" className="size-full object-cover" /> : null}
              {url !== undefined && file.type.startsWith('video/') ? <video src={url} muted playsInline preload="metadata" className="size-full object-cover" aria-hidden="true" /> : null}
              {url === undefined ? <Glyph name={file.type.startsWith('audio/') ? 'microphone' : 'file'} size={GLYPH_SIZE.lg} /> : null}
            </span>
            <span className="absolute bottom-0.5 start-1 rounded-chip px-1 text-chip font-semibold" style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)' }} aria-hidden="true">
              {over ? sizeLabel(file.size) : index + 1}
            </span>
            <button
              type="button"
              disabled={disabled}
              aria-label={labels.remove(name)}
              data-send-piece-remove={index}
              onClick={() => onRemove(index)}
              className="absolute -end-2 -top-2 grid size-11 place-items-center"
            >
              <span className="grid size-6 place-items-center rounded-full" style={{ backgroundColor: 'var(--color-ios-ink)', color: 'var(--color-ios-card)' }}>
                <Glyph name="x" size={GLYPH_SIZE.xs} />
              </span>
            </button>
            {files.length > 1 ? (
              <span className="send-sheet-piece-moves">
                <button type="button" disabled={disabled || index === 0} aria-label={`${labels.earlier} — ${name}`} onClick={() => onMove(index, -1)} className="sr-only focus:not-sr-only">
                  {labels.earlier}
                </button>
                <button type="button" disabled={disabled || index === files.length - 1} aria-label={`${labels.later} — ${name}`} onClick={() => onMove(index, 1)} className="sr-only focus:not-sr-only">
                  {labels.later}
                </button>
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Le bandeau « Trop lourd » (V9) — l'icône et le texte, jamais la couleur seule. */
export function OverLimitBanner({ text, trimLabel, onTrim }: { readonly text: string; readonly trimLabel: string; readonly onTrim: () => void }) {
  return (
    <div role="alert" data-send-over-limit="" className="mx-4 mt-2 flex items-center gap-2 rounded-card px-3 py-2 text-caption" style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}>
      <Glyph name="warningCircle" size={GLYPH_SIZE.sm} style={{ color: 'var(--color-error)' }} />
      <span className="min-w-0 flex-1">{text}</span>
      <button type="button" onClick={onTrim} className={`${BUTTON.secondary} shrink-0`}>
        {trimLabel}
      </button>
    </div>
  );
}

/* ─── 2. CE QU'ON PEUT EN FAIRE ──────────────────────────────────────────── */

export type ActionButton = { readonly id: string; readonly label: string; readonly glyph: 'copy' | 'share' | 'studio'; readonly onPress: () => void };

const ACTION_GLYPH = {
  copy: SEND_SHEET_GLYPHS.copy,
  share: SEND_SHEET_GLYPHS.shareNetwork,
  studio: SEND_SHEET_GLYPHS.article,
} as const;

/**
 * « PUBLIER » : story, fil, réel se COCHENT comme des destinataires (D2) ;
 * « Modifier dans le studio » et les actions de sortie sont immédiates. Une
 * action interdite n'est pas rendue — la ligne de motif dit pourquoi.
 */
export function ActionsZone({
  title,
  formats,
  formatLabel,
  chosen,
  disabled,
  onToggle,
  actions,
  reason,
}: {
  readonly title: string;
  readonly formats: readonly PublishFormat[];
  readonly formatLabel: (format: PublishFormat) => string;
  readonly chosen: readonly PublishFormat[];
  readonly disabled: boolean;
  readonly onToggle: (format: PublishFormat) => void;
  readonly actions: readonly ActionButton[];
  readonly reason: string | null;
}) {
  const titleId = useId();
  if (formats.length === 0 && actions.length === 0 && reason === null) return null;
  return (
    <section aria-labelledby={titleId} data-send-zone="actions">
      <SectionTitle id={titleId}>{title}</SectionTitle>
      {formats.length === 0 && actions.length === 0 ? null : (
        <div className="flex flex-wrap gap-2 px-4">
          {formats.map((format) => {
            const on = chosen.includes(format);
            return (
              <button
                key={format}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled}
                data-send-publish={format}
                onClick={() => onToggle(format)}
                className="inline-flex min-h-11 items-center gap-2 rounded-chip px-4 text-chip font-semibold"
                style={on ? { backgroundColor: 'var(--color-ios-brand)', color: 'var(--color-ios-on-brand)' } : { backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}
              >
                <GlyphSvg glyph={PUBLISH_GLYPH[format]} size={GLYPH_SIZE.md} />
                {formatLabel(format)}
              </button>
            );
          })}
          {actions.map((action) => (
            <button key={action.id} type="button" disabled={disabled} data-send-action={action.id} onClick={action.onPress} className={BUTTON.secondary}>
              <GlyphSvg glyph={ACTION_GLYPH[action.glyph]} size={GLYPH_SIZE.md} />
              {action.label}
            </button>
          ))}
        </div>
      )}
      {reason === null ? null : <ReasonLine>{reason}</ReasonLine>}
    </section>
  );
}

/* ─── 3. À QUI ───────────────────────────────────────────────────────────── */

export type PickerLabels = {
  readonly search: string;
  readonly searchPlaceholder: string;
  readonly recents: string;
  readonly conversations: string;
  readonly people: string;
  readonly communities: string;
  readonly select: (name: string) => string;
  readonly detail: (row: RecipientRow) => string | undefined;
  readonly channels: (count: number) => string;
  readonly emptyTitle: string;
  readonly emptyHint: string;
  readonly noResult: string;
};

type Rows = {
  readonly recents: readonly RecipientRow[];
  readonly conversations: readonly RecipientRow[];
  readonly people: readonly RecipientRow[];
  readonly communities: readonly CommunityRow[];
};

/** La rangée d'une communauté, dépliée en ses canaux où l'on écrit (D11). */
function CommunityGroup({
  community,
  labels,
  selectedKeys,
  inert,
  onToggle,
}: {
  readonly community: CommunityRow;
  readonly labels: PickerLabels;
  readonly selectedKeys: ReadonlySet<string>;
  readonly inert: (row: RecipientRow) => boolean;
  readonly onToggle: (row: RecipientRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <li data-send-community={community.id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="send-sheet-row flex min-h-14 w-full items-center gap-3 px-4 text-start"
        style={{ color: 'var(--color-ios-ink)' }}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-tile text-chip font-semibold" style={{ backgroundColor: community.color, color: 'var(--color-ios-on-brand)' }} aria-hidden="true">
          {community.initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body">{community.name}</span>
          <span className="truncate text-caption" style={MUTED}>
            {labels.channels(community.channels.length)}
          </span>
        </span>
        <Glyph name="caretDown" size={GLYPH_SIZE.sm} style={{ transform: open ? 'rotate(180deg)' : undefined, color: 'var(--color-ios-ink-3)' }} />
      </button>
      {open ? (
        <ul id={listId} className="ps-6">
          {community.channels.map((row) => {
            const detail = labels.detail(row);
            return <RecipientLine key={row.key} row={row} on={selectedKeys.has(row.key)} inert={inert(row)} {...(detail === undefined ? {} : { detail })} onToggle={() => onToggle(row)} />;
          })}
        </ul>
      ) : null}
    </li>
  );
}

function RowSection({
  title,
  rows,
  labels,
  selectedKeys,
  inert,
  onToggle,
}: {
  readonly title: string;
  readonly rows: readonly RecipientRow[];
  readonly labels: PickerLabels;
  readonly selectedKeys: ReadonlySet<string>;
  readonly inert: (row: RecipientRow) => boolean;
  readonly onToggle: (row: RecipientRow) => void;
}) {
  const id = useId();
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id}>{title}</SectionTitle>
      <ul>
        {rows.map((row) => {
          const detail = labels.detail(row);
          return <RecipientLine key={row.key} row={row} on={selectedKeys.has(row.key)} inert={inert(row)} {...(detail === undefined ? {} : { detail })} onToggle={() => onToggle(row)} />;
        })}
      </ul>
    </section>
  );
}

/** Les flèches parcourent les lignes de la liste — le focus va de bouton en bouton (planche, accessibilité web). */
const moveFocus = (event: KeyboardEvent<HTMLElement>): void => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('.send-sheet-row')];
  const index = rows.findIndex((row) => row === document.activeElement);
  if (index < 0) return;
  const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
  if (next === undefined) return;
  event.preventDefault();
  next.focus();
};

export function RecipientsZone({
  labels,
  query,
  onQuery,
  searchRef,
  rows,
  loading,
  selectedKeys,
  atCap,
  capLine,
  onToggle,
}: {
  readonly labels: PickerLabels;
  readonly query: string;
  readonly onQuery: (value: string) => void;
  readonly searchRef: RefObject<HTMLInputElement | null>;
  readonly rows: Rows;
  readonly loading: boolean;
  readonly selectedKeys: ReadonlySet<string>;
  readonly atCap: boolean;
  readonly capLine: string;
  readonly onToggle: (row: RecipientRow) => void;
}) {
  const recentId = useId();
  const communitiesId = useId();
  const inert = useMemo(() => (row: RecipientRow): boolean => atCap && !selectedKeys.has(row.key), [atCap, selectedKeys]);
  const searching = query.trim() !== '';
  const empty = rows.conversations.length === 0 && rows.people.length === 0 && rows.communities.length === 0;

  return (
    <div className="pb-3" data-send-zone="recipients" onKeyDown={moveFocus}>
      <div className="px-4 pt-3">
        <input
          ref={searchRef}
          type="search"
          value={query}
          onInput={(event) => onQuery(event.currentTarget.value)}
          aria-label={labels.search}
          placeholder={labels.searchPlaceholder}
          className="block min-h-11 w-full rounded-field px-4 text-body outline-none"
          style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}
        />
      </div>

      {atCap ? (
        <p className="px-4 pt-2 text-caption font-medium" style={MUTED}>
          {capLine}
        </p>
      ) : null}

      {!searching && rows.recents.length > 0 ? (
        <section aria-labelledby={recentId}>
          <SectionTitle id={recentId}>{labels.recents}</SectionTitle>
          <ul className="send-sheet-recents flex gap-2 overflow-x-auto px-3">
            {rows.recents.map((row) => (
              <RecentTile key={row.key} row={row} on={selectedKeys.has(row.key)} inert={inert(row)} ariaLabel={labels.select(row.label)} onToggle={() => onToggle(row)} />
            ))}
          </ul>
        </section>
      ) : null}

      <RowSection title={labels.conversations} rows={rows.conversations} labels={labels} selectedKeys={selectedKeys} inert={inert} onToggle={onToggle} />
      <RowSection title={labels.people} rows={rows.people} labels={labels} selectedKeys={selectedKeys} inert={inert} onToggle={onToggle} />

      {rows.communities.length === 0 ? null : (
        <section aria-labelledby={communitiesId}>
          <SectionTitle id={communitiesId}>{labels.communities}</SectionTitle>
          <ul>
            {rows.communities.map((community) => (
              <CommunityGroup key={community.id} community={community} labels={labels} selectedKeys={selectedKeys} inert={inert} onToggle={onToggle} />
            ))}
          </ul>
        </section>
      )}

      {empty && loading && !searching ? (
        <ul aria-busy="true" data-send-skeleton="" className="px-4 pt-3">
          {[0, 1, 2].map((line) => (
            <li key={line} className="flex min-h-14 items-center gap-3">
              <span className="size-10 rounded-full" style={{ backgroundColor: 'var(--color-ios-fill)' }} />
              <span className="h-3 flex-1 rounded-chip" style={{ backgroundColor: 'var(--color-ios-fill)' }} />
            </li>
          ))}
        </ul>
      ) : null}
      {empty && !loading && !searching ? (
        <div data-send-empty="" className="px-4 py-6 text-center">
          <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {labels.emptyTitle}
          </p>
          <p className="pt-1 text-caption" style={MUTED}>
            {labels.emptyHint}
          </p>
        </div>
      ) : null}
      {empty && searching ? (
        <p className="px-4 py-6 text-center text-body" style={MUTED}>
          {labels.noResult}
        </p>
      ) : null}
    </div>
  );
}

/* ─── 4. ENVOYER ─────────────────────────────────────────────────────────── */

export function SelectedRow({ rows, ariaLabel, chipLabel, onRemove }: { readonly rows: readonly RecipientRow[]; readonly ariaLabel: string; readonly chipLabel: (row: RecipientRow) => string; readonly onRemove: (row: RecipientRow) => void }) {
  if (rows.length === 0) return null;
  return (
    <ul aria-label={ariaLabel} className="send-sheet-selected flex gap-2 overflow-x-auto">
      {rows.map((row) => (
        <SelectedChip key={row.key} row={row} ariaLabel={chipLabel(row)} onRemove={() => onRemove(row)} />
      ))}
    </ul>
  );
}

/** « Ensemble / Séparément » (D3) — deux boutons radio natifs : les flèches les parcourent. */
export function GroupingToggle({
  label,
  together,
  separate,
  value,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly together: string;
  readonly separate: string;
  readonly value: 'together' | 'separate';
  readonly disabled: boolean;
  readonly onChange: (value: 'together' | 'separate') => void;
}) {
  const name = useId();
  return (
    <fieldset data-send-grouping={value} disabled={disabled} className="m-0 flex min-w-0 gap-1 rounded-chip border-0 p-1" style={{ backgroundColor: 'var(--color-ios-fill)' }}>
      <legend className="sr-only">{label}</legend>
      {(['together', 'separate'] as const).map((option) => {
        const on = option === value;
        return (
          <label
            key={option}
            className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center rounded-chip px-3 text-chip font-semibold focus-within:outline focus-within:outline-2"
            style={on ? { backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' } : { color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
          >
            <input type="radio" className="sr-only" name={name} value={option} checked={on} onChange={() => onChange(option)} />
            {option === 'together' ? together : separate}
          </label>
        );
      })}
    </fieldset>
  );
}

/** « Créer un groupe avec… » (D12) — dès deux personnes, éteint par défaut. */
export function CreateGroupSwitch({ label, on, disabled, onChange }: { readonly label: string; readonly on: boolean; readonly disabled: boolean; readonly onChange: (on: boolean) => void }) {
  return (
    <label data-send-create-group={on ? 'on' : 'off'} className="flex min-h-11 items-center gap-3 text-body" style={{ color: 'var(--color-ios-ink)' }}>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} className="size-5" style={{ accentColor: 'var(--color-ios-brand)' }} />
      <Glyph name="users" size={GLYPH_SIZE.md} />
      <span className="min-w-0 flex-1">{label}</span>
    </label>
  );
}
