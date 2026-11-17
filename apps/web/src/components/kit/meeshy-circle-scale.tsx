import '@/styles/kit-circle-scale.css';
import '@/styles/kit-motion.css';
import { memo, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

import {
  meeshyCircleScaleRecipe,
  meeshyCircleScaleRingDiameter,
  meeshyCircleScaleStyle,
  circleScaleRem,
  type MeeshyCircleScaleForm,
  type MeeshyCircleScaleRank,
  type MeeshyCircleScaleSize,
} from './meeshy-circle-scale-recipe';

export * from './meeshy-circle-scale-recipe';

export type MeeshyCircleScaleLevel = { readonly title: string; readonly glyph?: ReactNode };

export type MeeshyCircleScaleProps = {
  readonly levels: readonly MeeshyCircleScaleLevel[];
  readonly current?: number | null | undefined;
  readonly other?: number | null | undefined;
  readonly counts?: readonly number[] | undefined;
  readonly form?: MeeshyCircleScaleForm | undefined;
  readonly size?: MeeshyCircleScaleSize | undefined;
  readonly tint?: string | undefined;
  readonly otherTint?: string | undefined;
  readonly showsTitles?: boolean | undefined;
  readonly label?: string | undefined;
  readonly valueFormat?: string | undefined;
  readonly otherLabel?: string | undefined;
  readonly otherValueFormat?: string | undefined;
  readonly countLabel?: ((count: number) => string) | undefined;
  readonly onSelect?: ((rank: number) => void) | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly center?: ReactNode;
  readonly marker?: ReactNode;
  readonly className?: string | undefined;
};

const DEFAULT_VALUE_FORMAT = '%1 / %2';

const fill = (format: string, rank: number, count: number): string => format.replace('%1', String(rank)).replace('%2', String(count));

const numberText = (value: number): string => {
  const lang = typeof document === 'undefined' ? '' : document.documentElement.lang;
  try {
    return new Intl.NumberFormat(lang === '' ? undefined : lang).format(value);
  } catch {
    return String(value);
  }
};

const rankStyle = (rank: MeeshyCircleScaleRank): CSSProperties => ({ '--kit-scale-i': rank.intensity }) as CSSProperties;


const spokenOf = (props: MeeshyCircleScaleProps, current: number | null): string => {
  const { levels, label, valueFormat = DEFAULT_VALUE_FORMAT } = props;
  const title = label ?? (current === null ? levels.map((level) => level.title).join(', ') : (levels[current]?.title ?? ''));
  return current === null ? title : `${title}, ${fill(valueFormat, current + 1, levels.length)}`;
};

function Dot({ level, rank, count, isSelectable, isChecked, isFirstStop, showsTitle, onPick, onKeyDown, countLabel, isEnabled }: {
  readonly level: MeeshyCircleScaleLevel;
  readonly rank: MeeshyCircleScaleRank;
  readonly count: number | undefined;
  readonly isSelectable: boolean;
  readonly isChecked: boolean;
  readonly isFirstStop: boolean;
  readonly showsTitle: boolean;
  readonly onPick: (rank: number) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly countLabel: ((count: number) => string) | undefined;
  readonly isEnabled: boolean;
}) {
  const counted = count === undefined ? '' : `, ${countLabel === undefined ? numberText(count) : countLabel(count)}`;
  const body = (
    <>
      <span className="kit-scale__dot" data-ink={rank.ink} data-outline={rank.isOutline ? '' : undefined} style={rankStyle(rank)}>
        {count === undefined ? level.glyph : <span data-kit-count="" className="kit-scale__count">{numberText(count)}</span>}
      </span>
      {showsTitle ? <span className="kit-scale__title">{level.title}</span> : null}
    </>
  );
  if (!isSelectable) {
    return (
      <span className="kit-scale__cell" data-current={rank.isCurrent ? '' : undefined} aria-hidden="true">
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isChecked}
      aria-label={`${level.title}${counted}`}
      tabIndex={isChecked || isFirstStop ? 0 : -1}
      disabled={!isEnabled}
      className="kit-scale__cell"
      data-current={rank.isCurrent ? '' : undefined}
      onClick={() => onPick(rank.level)}
      onKeyDown={onKeyDown}
    >
      {body}
    </button>
  );
}

function Dots(props: MeeshyCircleScaleProps & { readonly ranks: readonly MeeshyCircleScaleRank[]; readonly current: number | null }) {
  const { levels, ranks, current, counts, onSelect, showsTitles = true, countLabel, isEnabled = true } = props;
  const shownCounts = counts !== undefined && counts.length === levels.length ? counts : undefined;
  const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const move = (event: KeyboardEvent<HTMLElement>): void => {
    const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = isRtl ? 'ArrowRight' : 'ArrowLeft';
    const from = current ?? -1;
    if (event.key === forward || event.key === 'ArrowDown') onSelect?.(Math.min(from + 1, levels.length - 1));
    else if (event.key === backward || event.key === 'ArrowUp') onSelect?.(Math.max(from - 1, 0));
    else return;
    event.preventDefault();
  };
  return (
    <div className="kit-scale__dots">
      {props.leading === undefined || props.leading === null ? null : <span className="kit-scale__leading">{props.leading}</span>}
      {ranks.map((rank) => (
        <Dot
          key={rank.level}
          level={levels[rank.level] ?? { title: '' }}
          rank={rank}
          count={shownCounts?.[rank.level]}
          isSelectable={onSelect !== undefined}
          isChecked={rank.isCurrent}
          isFirstStop={current === null && rank.level === 0}
          showsTitle={showsTitles && props.size !== 'compact'}
          onPick={(picked) => onSelect?.(picked)}
          onKeyDown={move}
          countLabel={countLabel}
          isEnabled={isEnabled}
        />
      ))}
      {props.trailing === undefined || props.trailing === null ? null : <span className="kit-scale__trailing">{props.trailing}</span>}
    </div>
  );
}

function Pill({ level, rank, leading, trailing, onSelect, isEnabled }: { readonly level: MeeshyCircleScaleLevel; readonly rank: MeeshyCircleScaleRank; readonly leading: ReactNode; readonly trailing: ReactNode; readonly onSelect: (() => void) | undefined; readonly isEnabled: boolean }) {
  const body = (
    <>
      {leading ?? level.glyph}
      <span className="kit-scale__pill-title">{level.title}</span>
      {trailing === undefined || trailing === null ? null : <span className="kit-scale__trailing">{trailing}</span>}
    </>
  );
  const style = rankStyle(rank);
  if (onSelect === undefined) return <span className="kit-scale__pill" data-ink={rank.ink} style={style}>{body}</span>;
  return (
    <button type="button" className="kit-scale__pill" data-ink={rank.ink} style={style} disabled={!isEnabled} onClick={onSelect}>
      {body}
    </button>
  );
}

function Rings({ levels, ranks, other, otherLabel, center, marker, showsTitles = true }: MeeshyCircleScaleProps & { readonly ranks: readonly MeeshyCircleScaleRank[]; readonly other: number | null }) {
  const count = levels.length;
  return (
    <div className="kit-scale__rings" style={{ '--kit-scale-box': circleScaleRem(meeshyCircleScaleRingDiameter(0, count)) } as CSSProperties}>
      <div className="kit-scale__ring-stage">
        {ranks.map((rank) => (
          <span
            key={rank.level}
            className="kit-scale__ring"
            data-kit-ring=""
            data-current={rank.isCurrent ? '' : undefined}
            data-other={rank.isOther ? '' : undefined}
            aria-hidden="true"
            style={{ ...rankStyle(rank), '--kit-scale-ring': circleScaleRem(meeshyCircleScaleRingDiameter(rank.level, count)) } as CSSProperties}
          />
        ))}
        {center === undefined || center === null ? null : <span className="kit-scale__center">{center}</span>}
        {marker === undefined || marker === null ? null : <span className="kit-scale__marker">{marker}</span>}
      </div>
      {showsTitles ? (
        <ul className="kit-scale__legend" aria-hidden="true">
          {[...ranks].reverse().map((rank) => (
            <li key={rank.level} data-current={rank.isCurrent ? '' : undefined} data-other={rank.isOther ? '' : undefined}>
              {levels[rank.level]?.title}
            </li>
          ))}
        </ul>
      ) : null}
      {other === null || otherLabel === undefined ? null : <span className="sr-only">{`${otherLabel}, ${levels[other]?.title ?? ''}`}</span>}
    </div>
  );
}

/**
 * Une échelle de proximité : un niveau parmi N, par l'intensité d'une seule teinte.
 * Sans `onSelect` : UN élément (image nommée « Proche, 5 / 6 ») ; avec : un groupe de
 * boutons radio nommés dont le courant est coché. Le niveau est toujours ÉCRIT ou dit,
 * jamais seulement teinté.
 */
export const MeeshyCircleScale = memo(function MeeshyCircleScale(props: MeeshyCircleScaleProps) {
  const { levels, current, other, form = 'dots', size, tint, otherTint, onSelect, isEnabled, className } = props;
  const recipe = meeshyCircleScaleRecipe({ count: levels.length, current, other, form, size, isEnabled });
  if (!recipe.isRenderable) return null;
  if (form === 'pill' && recipe.current === null) return null;
  const spoken = spokenOf(props, recipe.current);
  const isGroup = onSelect !== undefined && form === 'dots';
  const roleProps = isGroup ? { role: 'radiogroup' as const, 'aria-label': spoken } : { role: 'img' as const, 'aria-label': spoken };
  return (
    <div
      className={className === undefined ? 'kit-scale' : `kit-scale ${className}`}
      data-kit-circle-scale=""
      data-form={form}
      data-size={recipe.size}
      style={meeshyCircleScaleStyle(recipe, tint, otherTint)}
      {...roleProps}
    >
      {form === 'dots' ? <Dots {...props} ranks={recipe.ranks} current={recipe.current} /> : null}
      {form === 'pill' && recipe.current !== null ? (
        <Pill level={levels[recipe.current] ?? { title: '' }} rank={recipe.ranks[recipe.current] as MeeshyCircleScaleRank} leading={props.leading} trailing={props.trailing} onSelect={onSelect === undefined ? undefined : () => onSelect(recipe.current ?? 0)} isEnabled={isEnabled !== false} />
      ) : null}
      {form === 'rings' ? <Rings {...props} ranks={recipe.ranks} other={recipe.other} /> : null}
    </div>
  );
});

