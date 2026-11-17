import '@/styles/kit-person-row.css';
import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';

import {
  MEESHY_PERSON_ROW_MEASURE,
  meeshyPersonRowRecipe,
  meeshyPersonRowStyle,
  type MeeshyPersonRowSelection,
  type MeeshyPersonRowSize,
  type MeeshyPersonRowState,
  type MeeshyPersonRowSwipeAction,
} from './meeshy-person-row-recipe';

export * from './meeshy-person-row-recipe';

export type MeeshyPersonRowAction = Omit<MeeshyPersonRowSwipeAction, 'glyph'> & { readonly glyph: ReactNode };

export type MeeshyPersonRowProps = {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly levelLabel?: string | undefined;
  readonly titleAccessory?: ReactNode;
  readonly meta?: string | undefined;
  readonly metaDetail?: string | undefined;
  readonly state?: MeeshyPersonRowState | undefined;
  readonly isPending?: boolean | undefined;
  readonly statusLine?: string | undefined;
  readonly preview?: string | undefined;
  readonly ghostGlyph?: ReactNode;
  readonly selection?: MeeshyPersonRowSelection | undefined;
  readonly size?: MeeshyPersonRowSize | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly leadingActions?: readonly MeeshyPersonRowAction[] | undefined;
  readonly trailingActions?: readonly MeeshyPersonRowAction[] | undefined;
  readonly divider?: boolean | undefined;
  readonly label?: string | undefined;
  readonly avatar?: ReactNode;
  readonly trailing?: ReactNode;
  readonly secondaryTrailing?: ReactNode;
  readonly note?: ReactNode;
  readonly className?: string | undefined;
};

const CHECK = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

const closers = new Set<() => void>();

/** Une seule rangée est ouverte à la fois : ouvrir l'une referme celle qui l'était. */
const closeOthers = (keep: () => void): void => {
  for (const close of closers) if (close !== keep) close();
};

const orderedActions = (actions: readonly MeeshyPersonRowAction[] | undefined): readonly MeeshyPersonRowAction[] => {
  const capped = (actions ?? []).slice(0, MEESHY_PERSON_ROW_MEASURE.maxActions);
  return [...capped.filter((action) => action.role !== 'destructive'), ...capped.filter((action) => action.role === 'destructive')];
};

const spokenPhrase = (parts: readonly (string | undefined)[]): string => parts.filter((part): part is string => part !== undefined && part !== '').join(', ');

type Side = 'leading' | 'trailing';

function Actions({ side, actions, onPerformed }: { readonly side: Side; readonly actions: readonly MeeshyPersonRowAction[]; readonly onPerformed: () => void }) {
  if (actions.length === 0) return null;
  return (
    <div className="kit-person__actions" data-side={side} role="group">
      {actions.map((action) => (
        <button
          key={action.title}
          type="button"
          className="kit-person__action"
          data-kit-person-action=""
          data-role={action.role ?? 'default'}
          aria-label={action.title}
          onClick={() => {
            action.perform();
            onPerformed();
          }}
        >
          <span className="kit-person__action-glyph" aria-hidden="true">
            {action.glyph}
          </span>
          <span className="kit-person__action-title" aria-hidden="true">
            {action.title}
          </span>
        </button>
      ))}
    </div>
  );
}

const SWIPE_CLICK_WINDOW_MS = 400;

/**
 * Le balayage : il ouvre un bord, une autre rangée balayée ou un toucher ailleurs le referme.
 * Le clic qui TERMINE un balayage n'est pas un appui ; ouverte, un toucher sur la rangée la
 * referme au lieu de la presser.
 */
function useSwipe(hasLeading: boolean, hasTrailing: boolean, wrap: RefObject<HTMLDivElement | null>) {
  const [open, setOpen] = useState<Side | null>(null);
  const start = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const swipedAt = useRef<number | null>(null);
  const close = useRef(() => setOpen(null));
  useEffect(() => {
    const current = close.current;
    closers.add(current);
    return () => {
      closers.delete(current);
    };
  }, []);
  useEffect(() => {
    if (open === null) return;
    const onOutside = (event: Event): void => {
      if (event.target instanceof Node && wrap.current?.contains(event.target) === true) return;
      setOpen(null);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [open, wrap]);
  const settle = (side: Side | null): void => {
    setOpen(side);
    if (side !== null) closeOthers(close.current);
  };
  const handlers = {
    onPointerDown: (event: PointerEvent): void => {
      start.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event: PointerEvent): void => {
      const from = start.current;
      start.current = null;
      if (from === null) return;
      const dx = event.clientX - from.x;
      const isHorizontal = Math.abs(dx) > Math.abs(event.clientY - from.y) * 1.5;
      if (!isHorizontal || Math.abs(dx) < MEESHY_PERSON_ROW_MEASURE.swipeThreshold) return;
      swipedAt.current = event.timeStamp;
      const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
      const side: Side = (dx < 0) !== isRtl ? 'trailing' : 'leading';
      if (open === side) return settle(null);
      if (open !== null) return settle(null);
      if ((side === 'leading' && hasLeading) || (side === 'trailing' && hasTrailing)) settle(side);
    },
    onPointerCancel: (): void => {
      start.current = null;
    },
    onKeyDown: (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && open !== null) settle(null);
    },
  };
  /** Vrai quand le clic reçu n'est pas un appui : la fin d'un balayage, ou la fermeture d'une rangée ouverte. */
  const interceptsPress = (event: { readonly timeStamp: number }): boolean => {
    const swiped = swipedAt.current;
    swipedAt.current = null;
    if (swiped !== null && event.timeStamp - swiped < SWIPE_CLICK_WINDOW_MS) return true;
    if (open === null) return false;
    settle(null);
    return true;
  };
  return { open, settle, handlers, interceptsPress };
}

/**
 * Une rangée de personne : une personne, une rangée, une phrase. Sans `onPress`, un texte ;
 * avec, un seul bouton étiré dessous — l'accessoire interactif reste un second élément,
 * nommé. Les actions de balayage existent toujours comme boutons nommés (lecteur d'écran,
 * clavier), deux au plus par bord, le destructif en dernier. Rien n'est fabriqué : aucun
 * point de présence, aucune place gardée pour lui.
 */
export const MeeshyPersonRow = memo(function MeeshyPersonRow({
  title,
  subtitle,
  levelLabel,
  titleAccessory,
  meta,
  metaDetail,
  state,
  isPending,
  statusLine,
  preview,
  ghostGlyph,
  selection,
  size,
  onPress,
  leadingActions,
  trailingActions,
  divider,
  label,
  avatar,
  trailing,
  secondaryTrailing,
  note,
  className,
}: MeeshyPersonRowProps) {
  if (title === '') throw new Error('MeeshyPersonRow : le nom est obligatoire et déjà résolu par l’hôte.');
  const [isPressed, setPressed] = useState(false);
  const leading = orderedActions(leadingActions);
  const ending = orderedActions(trailingActions);
  const wrap = useRef<HTMLDivElement>(null);
  const { open, settle, handlers, interceptsPress } = useSwipe(leading.length > 0, ending.length > 0, wrap);
  const secondLine = isPending === true && statusLine !== undefined ? statusLine : preview ?? subtitle;
  const recipe = meeshyPersonRowRecipe({ size, state, selection, hasSubtitle: secondLine !== undefined && secondLine !== '', hasMeta: meta !== undefined, isPressed, isPending, hasOnPress: onPress !== undefined, divider });
  const phrase = label ?? spokenPhrase([title, levelLabel, secondLine, meta, metaDetail]);
  const isSingle = selection !== undefined && 'single' in selection;
  const checked = selection === undefined ? undefined : 'single' in selection ? selection.single : selection.multiple;
  const hasEnd = trailing !== undefined && trailing !== null;
  return (
    <div ref={wrap} className={className === undefined ? 'kit-person-wrap' : `kit-person-wrap ${className}`} data-kit-person-wrap="" {...handlers}>
      <div className="kit-person-swipe" data-open={open ?? undefined}>
        <Actions side="leading" actions={leading} onPerformed={() => settle(null)} />
        <div
          className="kit-person"
          style={meeshyPersonRowStyle(recipe)}
          data-kit-person-row=""
          data-size={recipe.size}
          data-state={recipe.state}
          data-pending={isPending === true ? '' : undefined}
          data-pressed={isPressed ? '' : undefined}
          data-divider={recipe.hasDivider ? '' : undefined}
          data-centered={recipe.centersTitle ? '' : undefined}
        >
          {onPress === undefined || !recipe.isPressable ? null : (
            <button
              type="button"
              className="kit-person__hit"
              data-kit-person-hit=""
              role={checked === undefined ? undefined : isSingle ? 'radio' : 'checkbox'}
              aria-checked={checked}
              aria-label={phrase}
              onClick={(event) => {
                if (!interceptsPress(event)) onPress();
              }}
              onPointerDown={() => setPressed(true)}
              onPointerUp={() => setPressed(false)}
              onPointerLeave={() => setPressed(false)}
              onPointerCancel={() => setPressed(false)}
            />
          )}
          <div className="kit-person__avatar" data-kit-person-avatar="">
            {recipe.avatar === 'ghost-disc' ? (
              <span className="kit-person__ghost" data-kit-person-ghost="" aria-hidden="true">
                {ghostGlyph}
              </span>
            ) : (
              avatar
            )}
          </div>
          <div className="kit-person__text" {...(onPress === undefined || !recipe.isPressable ? {} : { 'aria-hidden': 'true' as const })}>
            <span className="kit-person__name">
              <span className="kit-person__title">{title}</span>
              {titleAccessory === undefined || titleAccessory === null ? null : (
                <span className="kit-person__level" aria-hidden="true">
                  {titleAccessory}
                </span>
              )}
              {levelLabel === undefined ? null : <span className="sr-only">, {levelLabel}</span>}
            </span>
            {secondLine === undefined || secondLine === '' ? null : <span className="kit-person__subtitle">{secondLine}</span>}
          </div>
          {meta === undefined ? null : (
            <div className="kit-person__meta" aria-hidden={onPress === undefined || !recipe.isPressable ? undefined : 'true'}>
              <span className="kit-person__meta-value">{meta}</span>
              {metaDetail === undefined ? null : <span className="kit-person__meta-detail">{metaDetail}</span>}
            </div>
          )}
          {secondaryTrailing === undefined || secondaryTrailing === null ? null : <div className="kit-person__secondary">{secondaryTrailing}</div>}
          {checked === undefined ? null : (
            <span className="kit-person__check" aria-hidden="true" data-checked={checked ? '' : undefined}>
              {checked ? CHECK : null}
            </span>
          )}
          {hasEnd ? <div className="kit-person__trailing">{trailing}</div> : null}
          {note === undefined || note === null ? null : <div className="kit-person__note">{note}</div>}
        </div>
        <Actions side="trailing" actions={ending} onPerformed={() => settle(null)} />
      </div>
    </div>
  );
});

export type MeeshyPersonRowSkeletonProps = { readonly size?: MeeshyPersonRowSize | undefined };

/** Le squelette d'une rangée : même encombrement que la rangée de sa taille, muet à la voix. */
export function MeeshyPersonRowSkeleton({ size }: MeeshyPersonRowSkeletonProps) {
  const recipe = meeshyPersonRowRecipe({ size });
  return (
    <div className="kit-person kit-person--skeleton" aria-hidden="true" style={meeshyPersonRowStyle(recipe)} data-kit-person-skeleton="" data-size={recipe.size}>
      <span className="kit-person__avatar kit-person__ghost" />
      <span className="kit-person__text">
        <span className="kit-person__bar" data-wide="" />
        <span className="kit-person__bar" />
      </span>
    </div>
  );
}
