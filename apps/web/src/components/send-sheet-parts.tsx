import { useEffect, useState, type ReactNode } from 'react';

import type { PublishFormat, SendPayload } from '@/lib/send/send-sheet-plan';

import { Avatar } from './avatar';
import { Glyph, GlyphSvg } from './glyph';
import type { GlyphName } from './glyphs';
import { SEND_SHEET_GLYPHS } from './glyphs-send-sheet';
import type { PreviewView, RecipientRow, StatusView } from './send-sheet-model';
import { BUTTON, GLYPH_SIZE } from './ui-chrome';

/**
 * LES PIÈCES DE LA FEUILLE D'ENVOI (#8884) — des vues SANS état : l'aperçu, la
 * rangée « Publier », une ligne de destinataire, une puce, une ligne d'état.
 * Chacune reçoit ses libellés déjà traduits : aucune ne lit un catalogue.
 */

export const PUBLISH_ORDER: readonly PublishFormat[] = ['STORY', 'POST', 'REEL'];

export const PUBLISH_GLYPH = {
  STORY: SEND_SHEET_GLYPHS.circleDashed,
  POST: SEND_SHEET_GLYPHS.article,
  REEL: SEND_SHEET_GLYPHS.filmStrip,
} as const;

const SECTION_CLASS = 'px-4 pb-1 pt-3 text-chip font-semibold uppercase tracking-wide';

export function SectionTitle({ id, children }: { readonly id?: string; readonly children: ReactNode }) {
  return (
    <h3 id={id} className={SECTION_CLASS} style={{ color: 'var(--color-ios-ink-2)' }}>
      {children}
    </h3>
  );
}

const KIND_GLYPH: Readonly<Record<PreviewView['kind'], GlyphName | null>> = {
  text: null,
  messages: 'checks',
  image: 'image',
  video: null,
  audio: 'microphone',
  file: 'file',
  publication: null,
};

/** La vignette d'un fichier IMAGE neuf — une adresse locale, rendue au démontage. */
function useFileThumb(payload: SendPayload): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    const first = payload.kind === 'files' ? payload.files[0] : undefined;
    if (first === undefined || !first.type.startsWith('image/') || typeof URL.createObjectURL !== 'function') return;
    const local = URL.createObjectURL(first);
    setUrl(local);
    return () => URL.revokeObjectURL(local);
  }, [payload]);
  return url;
}

function PreviewThumb({ view, thumbUrl }: { readonly view: PreviewView; readonly thumbUrl: string | undefined }) {
  const tile = 'size-14 shrink-0 overflow-hidden rounded-tile object-cover';
  if (thumbUrl !== undefined && view.kind === 'video') {
    return <video src={thumbUrl} muted playsInline preload="metadata" className={tile} aria-hidden="true" />;
  }
  if (thumbUrl !== undefined) return <img src={thumbUrl} alt="" className={tile} />;
  const glyph = KIND_GLYPH[view.kind];
  const shape = view.kind === 'video' ? SEND_SHEET_GLYPHS.videoCamera : view.kind === 'publication' ? SEND_SHEET_GLYPHS.article : null;
  if (glyph === null && shape === null) return null;
  return (
    <span className="grid size-14 shrink-0 place-items-center rounded-tile" style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink-3)' }}>
      {shape === null ? <Glyph name={glyph ?? 'file'} size={GLYPH_SIZE.lg} /> : <GlyphSvg glyph={shape} size={GLYPH_SIZE.lg} />}
    </span>
  );
}

export function PreviewCard({ payload, view, label }: { readonly payload: SendPayload; readonly view: PreviewView; readonly label: string | undefined }) {
  const fileThumb = useFileThumb(payload);
  const thumbUrl = view.thumbUrl ?? fileThumb;
  return (
    <div data-send-preview={view.kind} className="glass glass-card flex items-center gap-3 rounded-card p-3">
      <PreviewThumb view={view} thumbUrl={thumbUrl} />
      <div className="min-w-0 flex-1">
        {label === undefined ? null : (
          <p className="text-chip font-semibold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink)' }}>
            {label}
          </p>
        )}
        {view.text === undefined ? null : (
          <p className="line-clamp-3 whitespace-pre-line break-words text-bubble" style={{ color: 'var(--color-ios-ink)' }}>
            {view.text}
          </p>
        )}
      </div>
      {view.count === undefined ? null : (
        <span
          className="grid min-w-7 place-items-center rounded-chip px-2 text-chip font-semibold"
          style={{ minHeight: 28, backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}
        >
          {view.count}
        </span>
      )}
    </div>
  );
}

export function PublishChip({
  format,
  label,
  on,
  disabled,
  onToggle,
}: {
  readonly format: PublishFormat;
  readonly label: string;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      data-send-publish={format}
      onClick={onToggle}
      className="inline-flex min-h-11 items-center gap-2 rounded-chip px-4 text-chip font-semibold"
      style={
        on
          ? { backgroundColor: 'var(--color-ios-brand)', color: 'var(--color-ios-on-brand)' }
          : { backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }
      }
    >
      <GlyphSvg glyph={PUBLISH_GLYPH[format]} size={GLYPH_SIZE.md} />
      {label}
    </button>
  );
}

function RowAvatar({ row, size }: { readonly row: RecipientRow; readonly size: number }) {
  return <Avatar initials={row.initials} color={row.color} size={size} {...(row.avatarUrl === undefined ? {} : { src: row.avatarUrl })} />;
}

function CheckDisc({ on }: { readonly on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-full"
      style={
        on
          ? { backgroundColor: 'var(--color-ios-brand)', color: 'var(--color-ios-on-brand)' }
          : { border: '2px solid var(--color-ios-outline)' }
      }
    >
      {on ? <Glyph name="check" size={GLYPH_SIZE.sm} /> : null}
    </span>
  );
}

export function RecipientLine({
  row,
  on,
  inert,
  onToggle,
}: {
  readonly row: RecipientRow;
  readonly on: boolean;
  readonly inert: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-disabled={inert ? true : undefined}
        data-send-target={row.key}
        onClick={inert ? undefined : onToggle}
        className="flex min-h-14 w-full items-center gap-3 px-4 text-start"
        style={{ color: 'var(--color-ios-ink)', opacity: inert ? 0.45 : 1 }}
      >
        <RowAvatar row={row} size={40} />
        <span className="min-w-0 flex-1 truncate text-body">{row.label}</span>
        {row.isGroup ? <GlyphSvg glyph={SEND_SHEET_GLYPHS.usersThree} size={GLYPH_SIZE.md} style={{ color: 'var(--color-ios-ink-3)' }} /> : null}
        <CheckDisc on={on} />
      </button>
    </li>
  );
}

export function RecentTile({
  row,
  on,
  inert,
  ariaLabel,
  onToggle,
}: {
  readonly row: RecipientRow;
  readonly on: boolean;
  readonly inert: boolean;
  readonly ariaLabel: string;
  readonly onToggle: () => void;
}) {
  return (
    <li className="shrink-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-disabled={inert ? true : undefined}
        aria-label={ariaLabel}
        data-send-recent={row.key}
        onClick={inert ? undefined : onToggle}
        className="flex w-16 flex-col items-center gap-1 py-1"
        style={{ opacity: inert ? 0.45 : 1 }}
      >
        <span className="relative">
          <RowAvatar row={row} size={52} />
          {on ? (
            <span className="absolute -bottom-0.5 -end-0.5">
              <CheckDisc on />
            </span>
          ) : null}
        </span>
        <span className="w-full truncate text-center text-chip" style={{ color: 'var(--color-ios-ink-2)' }}>
          {row.label}
        </span>
      </button>
    </li>
  );
}

export function SelectedChip({ row, ariaLabel, onRemove }: { readonly row: RecipientRow; readonly ariaLabel: string; readonly onRemove: () => void }) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked="true"
        aria-label={ariaLabel}
        data-send-chip={row.key}
        onClick={onRemove}
        className="inline-flex min-h-11 max-w-48 items-center gap-1.5 rounded-chip ps-1 pe-2.5 text-chip font-medium"
        style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}
      >
        <RowAvatar row={row} size={24} />
        <span className="truncate">{row.label}</span>
        <Glyph name="x" size={GLYPH_SIZE.xs} style={{ color: 'var(--color-ios-ink-3)' }} />
      </button>
    </li>
  );
}

const TONE_INK: Readonly<Record<StatusView['tone'], string>> = {
  sending: 'var(--color-ios-ink-2)',
  sent: 'var(--color-ok)',
  failed: 'var(--color-error)',
};

export type StatusEntry = {
  readonly key: string;
  readonly label: string;
  readonly row: RecipientRow | undefined;
  readonly format: PublishFormat | undefined;
};

export function StatusLine({
  entry,
  view,
  statusLabel,
  retryLabel,
  onRetry,
}: {
  readonly entry: StatusEntry;
  readonly view: StatusView;
  readonly statusLabel: string;
  readonly retryLabel: string;
  readonly onRetry: () => void;
}) {
  return (
    <li data-send-status={view.tone} data-send-status-key={entry.key} className="flex min-h-14 items-center gap-3 px-4" aria-busy={view.tone === 'sending' ? true : undefined}>
      {entry.row !== undefined ? (
        <RowAvatar row={entry.row} size={40} />
      ) : (
        <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-brand)' }}>
          {entry.format === undefined ? null : <GlyphSvg glyph={PUBLISH_GLYPH[entry.format]} size={GLYPH_SIZE.lg} />}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-body" style={{ color: 'var(--color-ios-ink)' }}>
        {entry.label}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-caption font-medium" style={{ color: TONE_INK[view.tone] }}>
        {view.tone === 'sent' ? <Glyph name="check" size={GLYPH_SIZE.sm} /> : null}
        {view.tone === 'failed' ? <Glyph name="warningCircle" size={GLYPH_SIZE.sm} /> : null}
        {statusLabel}
      </span>
      {view.retry ? (
        <button type="button" onClick={onRetry} className={`${BUTTON.secondary} shrink-0`}>
          <GlyphSvg glyph={SEND_SHEET_GLYPHS.arrowClockwise} size={GLYPH_SIZE.sm} />
          {retryLabel}
        </button>
      ) : null}
    </li>
  );
}
