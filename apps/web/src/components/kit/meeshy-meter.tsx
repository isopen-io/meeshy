import '@/styles/kit-meter.css';
import '@/styles/kit-motion.css';
import { memo, type CSSProperties, type ReactNode } from 'react';

import {
  meeshyMeterFraction,
  meeshyMeterRecipe,
  meeshyMeterStyle,
  type MeeshyMeterForm,
  type MeeshyMeterKind,
  type MeeshyMeterSize,
} from './meeshy-meter-recipe';

export * from './meeshy-meter-recipe';

export type MeeshyMeterProps = {
  readonly value: number;
  readonly label: string;
  readonly total?: number | undefined;
  readonly spokenValue?: string | undefined;
  readonly form?: MeeshyMeterForm | undefined;
  readonly kind?: MeeshyMeterKind | undefined;
  readonly fullKind?: MeeshyMeterKind | undefined;
  readonly tint?: string | undefined;
  readonly tintEnd?: string | undefined;
  readonly size?: MeeshyMeterSize | undefined;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly title?: string | undefined;
  readonly valueText?: string | undefined;
  readonly startCaption?: string | undefined;
  readonly endCaption?: string | undefined;
  readonly marks?: readonly number[] | undefined;
  readonly isStale?: boolean | undefined;
  readonly animatesOnAppear?: boolean | undefined;
  readonly className?: string | undefined;
};

const percentText = (fraction: number): string => {
  const lang = typeof document === 'undefined' ? '' : document.documentElement.lang;
  try {
    return new Intl.NumberFormat(lang === '' ? undefined : lang, { style: 'percent', maximumFractionDigits: 0 }).format(fraction);
  } catch {
    return `${Math.round(fraction * 100)} %`;
  }
};

const isRightToLeft = (): boolean => typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

const clamp = (value: number, total: number): number => Math.min(Math.max(value, 0), total);

function Decoration({ marks, isStepped }: { readonly marks: readonly number[]; readonly isStepped: boolean }) {
  if (isStepped || marks.length === 0) return null;
  return (
    <>
      {marks.map((mark) => (
        <span key={mark} className="kit-meter__mark" aria-hidden="true" style={{ insetInlineStart: `${Math.min(Math.max(mark, 0), 1) * 100}%` }} />
      ))}
    </>
  );
}

/**
 * Une jauge : UN élément (barre de progression nommée par `label`, valeur dite
 * « 23 sur 50 » ou le pourcentage de la locale). La valeur dite est la vraie dès le
 * premier rendu ; en-tête et légendes ne sont pas relus ; rien ne se touche.
 */
export const MeeshyMeter = memo(function MeeshyMeter({
  value,
  label,
  total = 1,
  spokenValue,
  form = 'continuous',
  kind,
  fullKind,
  tint,
  tintEnd,
  size = 8,
  leading,
  trailing,
  title,
  valueText,
  startCaption,
  endCaption,
  marks = [],
  isStale,
  animatesOnAppear = true,
  className,
}: MeeshyMeterProps) {
  const isIndeterminate = form === 'indeterminate';
  const fraction = isIndeterminate ? null : meeshyMeterFraction(value, total);
  if (!isIndeterminate && fraction === null) return null;
  const recipe = meeshyMeterRecipe({ form, size, fraction, kind, fullKind, tint, isStale, isRtl: isRightToLeft() });
  const isStepped = recipe.stepCount > 0;
  const aria = isIndeterminate
    ? {}
    : { 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': clamp(value, total), 'aria-valuetext': spokenValue ?? percentText(fraction ?? 0) };
  return (
    <div className={className === undefined ? 'kit-meter' : `kit-meter ${className}`} data-kit-meter="" style={meeshyMeterStyle(recipe, tint, tintEnd)}>
      {title === undefined && valueText === undefined ? null : (
        <div className="kit-meter__head" aria-hidden="true">
          {title === undefined ? null : <span data-kit-meter-title="" aria-hidden="true">{title}</span>}
          {valueText === undefined ? null : <span className="kit-meter__value" data-kit-meter-value="" aria-hidden="true">{valueText}</span>}
        </div>
      )}
      <div className="kit-meter__row">
        {leading === undefined || leading === null ? null : <span className="kit-meter__leading">{leading}</span>}
        <div
          role="progressbar"
          aria-label={label}
          {...aria}
          className="kit-meter__track"
          data-form={isIndeterminate ? 'indeterminate' : isStepped ? 'stepped' : 'continuous'}
          data-kind={recipe.kind}
          {...(animatesOnAppear ? { 'data-enters': '' } : {})}
          {...(recipe.isMoving ? { 'data-moving': '' } : {})}
        >
          {isIndeterminate ? <span className="kit-meter__segment" aria-hidden="true" /> : null}
          {isStepped
            ? Array.from({ length: recipe.stepCount }, (_, index) => (
                <span key={index} className="kit-meter__step" aria-hidden="true" {...(index < recipe.filledSteps ? { 'data-filled': '' } : {})} />
              ))
            : null}
          {recipe.showsFill && !isStepped ? (
            <span className="kit-meter__fill" aria-hidden="true" data-kit-meter-fill="" style={{ '--kit-meter-fraction': fraction } as CSSProperties} />
          ) : null}
          <Decoration marks={marks} isStepped={isStepped} />
        </div>
        {trailing === undefined || trailing === null ? null : <span className="kit-meter__trailing">{trailing}</span>}
      </div>
      {startCaption === undefined && endCaption === undefined ? null : (
        <div className="kit-meter__captions" aria-hidden="true">
          <span data-kit-meter-start-caption="" aria-hidden="true">{startCaption}</span>
          <span data-kit-meter-end-caption="" aria-hidden="true">{endCaption}</span>
        </div>
      )}
    </div>
  );
});

