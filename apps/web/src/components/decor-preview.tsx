import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { myProfileQueryOptions } from '@/lib/api/profile';
import { translatePackPreview } from '@/lib/i18n-pack-preview-catalog';
import { translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { equipChoiceOf, isAnimatedDecor, stepIndex, type DecorItem } from '@/lib/packs/decor-items';
import { isZoomed, MIN_ZOOM, toggleZoom, wheelZoom, zoomBy } from '@/lib/packs/preview-zoom';
import { decorItemName, useAppearanceNames, usePackItems, useProposals, type PackRef } from '@/lib/packs/use-pack-items';
import { equipProfileDecor } from '@/lib/profile-decor/equip';
import { useDecorDesigns } from '@/lib/profile-decor/use-decor-designs';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

import { DecorStage, DecorThumb } from './decor-stage';
import { Glyph, GlyphSvg } from './glyph';
import { PACK_PREVIEW_GLYPHS } from './glyphs-pack-preview';
import type { PackAction } from './pack-shop';
import { useScheme } from './profile-banner-design';

/**
 * **LE PLEIN ÉCRAN D'UN ÉLÉMENT DE DÉCOR** (#16267) — l'élément POSÉ sur ce
 * qu'il décore (mon avatar, ma bannière, une conversation), animé s'il l'est.
 * On parcourt tout le pack (flèches, glissement, ← →), un indicateur dit
 * « n / N » ; on zoome à la molette ou au pincement, ×2 au double-clic, par
 * + et − — et tant que l'élément est zoomé, on ne change pas d'élément. Une
 * rangée « Autres propositions » montre les packs voisins du même domaine.
 *
 * « Équiper » applique l'élément en un geste par `equipProfileDecor`
 * (optimiste, retour arrière sur refus) ; un pack gratuit pas encore installé
 * s'installe d'abord, par le geste de la boutique. Un fond se choisit par
 * conversation : la boutique le montre, sans l'équiper.
 *
 * `<dialog>` modal (focus piégé par le navigateur) ; ✕, Échap et le retour du
 * navigateur (`useBackDismiss`, une entrée d'historique) rendent la boutique
 * telle qu'elle était, défilement compris : elle n'a jamais été démontée.
 */

const FALLBACK_ACCENT = '#6366F1';
const SWIPE_DISTANCE = 48;

export type DecorPreviewProps = {
  readonly language: InterfaceLanguage;
  readonly deps: ConversationsDeps;
  readonly pack: PackRef & { readonly title: string; readonly installed: boolean };
  readonly index: number;
  readonly packs: readonly PackRef[];
  readonly action: PackAction;
  readonly busy: boolean;
  readonly notice: string;
  readonly onIndex: (index: number) => void;
  readonly onProposal: (item: DecorItem) => void;
  /** Le geste du pack (Installer, Acheter) ; `true` une fois confirmé. */
  readonly onAction: () => Promise<boolean>;
  readonly onClose: () => void;
};

const isRtl = (element: HTMLElement | null): boolean => element !== null && getComputedStyle(element).direction === 'rtl';

export function DecorPreview(props: DecorPreviewProps) {
  const { language, deps, pack, index, packs, action, busy, notice, onIndex, onProposal, onAction, onClose } = props;
  const t = translateStickerPacks;
  const tp = translatePackPreview;
  const ref = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const queryClient = useQueryClient();
  const scheme = useScheme();
  const names = useAppearanceNames(language);
  const items = usePackItems(pack, deps);
  const proposals = useProposals({ current: pack, packs, deps });
  const profile = useQuery({ ...myProfileQueryOptions(deps), enabled: deps.source === 'gateway' });
  const mine = useDecorDesigns(profile.data?.profileDecor);
  const accent = profile.data === undefined ? FALLBACK_ACCENT : authorAccentColor(profile.data.id, profile.data.displayName ?? profile.data.username);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [equipFailed, setEquipFailed] = useState(false);
  const pointer = useRef<{ readonly x: number; readonly y: number; readonly id: number } | null>(null);

  useBackDismiss(onClose);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    if (!dialog.open) dialog.showModal?.();
    return () => {
      if (dialog.open) dialog.close?.();
    };
  }, []);

  const list = items.data?.items ?? [];
  const count = list.length;
  const shown = Math.min(index, Math.max(0, count - 1));
  const item = list[shown];

  useEffect(() => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    setEquipFailed(false);
  }, [pack.domain, pack.slug, shown]);

  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null) return undefined;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      setZoom((current) => wheelZoom(current, event.deltaY));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  const zoomed = isZoomed(zoom);
  const canStep = !zoomed && count > 1;
  const step = (delta: number): void => {
    if (canStep) onIndex(stepIndex({ count, current: shown, delta }));
  };
  const setScale = (next: number): void => {
    setZoom(next);
    if (!isZoomed(next)) setPan({ x: 0, y: 0 });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>): void => {
    const forward = isRtl(ref.current) ? -1 : 1;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(forward);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-forward);
    } else if (event.key === '+' || event.key === '=') {
      setScale(zoomBy(zoom, 1));
    } else if (event.key === '-') {
      setScale(zoomBy(zoom, -1));
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    pointer.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const start = pointer.current;
    if (start === null || !zoomed || start.id !== event.pointerId) return;
    setPan((current) => ({ x: current.x + event.clientX - start.x, y: current.y + event.clientY - start.y }));
    pointer.current = { ...start, x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const start = pointer.current;
    pointer.current = null;
    if (start === null || zoomed) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) < SWIPE_DISTANCE) return;
    const forward = isRtl(ref.current) ? -1 : 1;
    step(dx < 0 ? forward : -forward);
  };

  const target = item === undefined ? null : equipChoiceOf(item, items.data?.contract ?? null);
  const decor = profile.data?.profileDecor;
  const equipped = target !== null && decor !== undefined && decor[target.side]?.pack === target.choice.pack && decor[target.side]?.item === target.choice.item;
  const installable = pack.installed || action.kind === 'toggle';
  const equip = async (): Promise<void> => {
    if (target === null) return;
    setEquipFailed(false);
    if (!pack.installed && !(await onAction())) return;
    const outcome = await equipProfileDecor({ queryClient, deps, side: target.side, choice: target.choice });
    if (outcome.status !== 'saved') setEquipFailed(true);
  };

  const itemName = item === undefined ? '' : decorItemName(names, item);
  const status = equipFailed ? tp(language, 'packs.preview.equipFailed') : notice;
  const roundButton = 'grid min-h-11 min-w-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40';
  const chrome = { color: 'var(--color-ios-ink)', backgroundColor: 'var(--color-ios-fill)', outlineColor: 'var(--color-ios-brand)' } as const;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-decor-preview={`${pack.domain}:${pack.slug}`}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none p-0"
      style={{ border: 0, backgroundColor: 'var(--color-ios-surface)', color: 'var(--color-ios-ink)' }}
    >
      <div className="flex h-full flex-col pt-safe pb-safe">
        <header className="flex shrink-0 items-center gap-2 px-3 py-2">
          <button type="button" data-decor-preview-close aria-label={tp(language, 'packs.preview.close')} onClick={onClose} className={roundButton} style={chrome}>
            <Glyph name="x" size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-body font-semibold">
              {pack.title}
            </h2>
            {count === 0 ? null : (
              <p data-decor-position className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                <span aria-hidden="true">{`${shown + 1} / ${count}`}</span>
                <span className="sr-only">{tp(language, 'packs.preview.position', { index: String(shown + 1), count: String(count) })}</span>
              </p>
            )}
          </div>
          <button type="button" data-decor-zoom-out aria-label={tp(language, 'packs.preview.zoomOut')} disabled={!zoomed} onClick={() => setScale(zoomBy(zoom, -1))} className={roundButton} style={chrome}>
            <GlyphSvg glyph={PACK_PREVIEW_GLYPHS.minus} size={18} />
          </button>
          <button type="button" data-decor-zoom-in aria-label={tp(language, 'packs.preview.zoomIn')} onClick={() => setScale(zoomBy(zoom, 1))} className={roundButton} style={chrome}>
            <Glyph name="plus" size={18} />
          </button>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4">
          <div
            ref={stageRef}
            data-decor-stage-host
            data-zoom={String(zoom)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              pointer.current = null;
            }}
            onDoubleClick={() => setScale(toggleZoom(zoom))}
            className="flex size-full touch-none select-none items-center justify-center"
          >
            {item !== undefined ? (
              <div
                className="flex w-full items-center justify-center transition-transform duration-150 motion-reduce:transition-none"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              >
                <DecorStage item={item} profile={profile.data} mine={mine} accent={accent} scheme={scheme} language={language} />
              </div>
            ) : items.isError ? (
              <div className="grid justify-items-center gap-3 text-center">
                <p role="status" className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {tp(language, 'packs.sheet.failed')}
                </p>
                <button type="button" data-decor-retry onClick={() => void items.refetch()} className="min-h-11 rounded-full px-4 text-body font-semibold" style={chrome}>
                  {t(language, 'packs.retry')}
                </button>
              </div>
            ) : (
              <div data-decor-loading role="status" className="grid justify-items-center gap-3">
                <span aria-hidden="true" className="block size-48 animate-pulse rounded-card motion-reduce:animate-none" style={{ backgroundColor: 'var(--color-ios-fill)' }} />
                <span className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {tp(language, 'packs.sheet.loading')}
                </span>
              </div>
            )}
          </div>
          {count > 1 ? (
            <>
              <button
                type="button"
                data-decor-previous
                aria-label={tp(language, 'packs.preview.previous')}
                disabled={!canStep}
                onClick={() => step(-1)}
                className={`${roundButton} absolute start-3 top-1/2 -translate-y-1/2`}
                style={chrome}
              >
                <Glyph name="caretLeft" size={18} className="rtl:-scale-x-100" />
              </button>
              <button
                type="button"
                data-decor-next
                aria-label={tp(language, 'packs.preview.next')}
                disabled={!canStep}
                onClick={() => step(1)}
                className={`${roundButton} absolute end-3 top-1/2 -translate-y-1/2`}
                style={chrome}
              >
                <GlyphSvg glyph={PACK_PREVIEW_GLYPHS.caretRight} size={18} className="rtl:-scale-x-100" />
              </button>
            </>
          ) : null}
        </div>

        <div className="mx-auto flex w-full max-w-xl shrink-0 flex-col gap-3 px-4 pt-3">
          {item === undefined ? null : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p data-decor-item-name className="truncate text-body font-semibold">
                  {itemName}
                </p>
                {isAnimatedDecor(item) ? (
                  <p data-decor-animated className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                    {tp(language, 'packs.preview.animated')}
                  </p>
                ) : null}
              </div>
              {target === null ? null : equipped ? (
                <span data-decor-equipped className="shrink-0 px-4 text-body font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {tp(language, 'packs.preview.equipped')}
                </span>
              ) : installable && decor !== undefined ? (
                <button
                  type="button"
                  data-decor-equip
                  aria-busy={busy}
                  aria-label={`${tp(language, 'packs.preview.equip')} ${itemName}`}
                  onClick={() => void equip()}
                  className="min-h-11 shrink-0 rounded-full px-5 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ backgroundColor: 'var(--accent, var(--color-ios-brand))', color: 'var(--color-ios-on-brand)', outlineColor: 'var(--color-ios-brand)' }}
                >
                  {tp(language, 'packs.preview.equip')}
                </button>
              ) : action.kind === 'buy' ? (
                <button type="button" data-decor-pack-action aria-busy={busy} onClick={() => void onAction()} className="min-h-11 shrink-0 rounded-full px-4 text-body font-semibold" style={chrome}>
                  {action.label}
                </button>
              ) : action.kind === 'locked' ? (
                <span data-decor-locked className="shrink-0 px-4 text-body font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {action.label}
                </span>
              ) : null}
            </div>
          )}
          {item?.domain === 'wallpaper' ? (
            <p data-decor-wallpaper-hint className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {tp(language, 'packs.preview.wallpaperHint')}
            </p>
          ) : null}
          <p role="status" aria-live="polite" className="text-caption empty:hidden" style={{ color: 'var(--ios-error)' }}>
            {status}
          </p>
          {proposals.length === 0 ? null : (
            <section aria-labelledby={`${titleId}-others`} className="flex flex-col gap-2 pb-3">
              <h3 id={`${titleId}-others`} className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
                {tp(language, 'packs.preview.others')}
              </h3>
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {proposals.map((proposal) => (
                  <li key={`${proposal.pack}/${proposal.key}`} className="shrink-0" style={{ width: proposal.domain === 'avatar-ring' || proposal.domain === 'wallpaper' ? 64 : 120 }}>
                    <button
                      type="button"
                      data-decor-proposal={`${proposal.pack}/${proposal.key}`}
                      aria-label={decorItemName(names, proposal)}
                      onClick={() => onProposal(proposal)}
                      className="grid w-full place-items-center rounded-chip p-1 focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ minHeight: 44, backgroundColor: 'var(--color-ios-fill)', outlineColor: 'var(--color-ios-brand)' }}
                    >
                      <DecorThumb item={proposal} accent={accent} scheme={scheme} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
