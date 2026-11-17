import '@/styles/kit-stepper.css';
import '@/styles/kit-motion.css';
import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import {
  MEESHY_STEPPER_HOLD,
  meeshyStepperHoldInterval,
  meeshyStepperMarkSize,
  meeshyStepperNext,
  meeshyStepperRecipe,
  meeshyStepperStyle,
  stepperRem,
  type MeeshyStepperKind,
  type MeeshyStepperLadder,
  type MeeshyStepperRange,
  type MeeshyStepperSize,
  type MeeshyStepperStop,
} from './meeshy-stepper-recipe';

export * from './meeshy-stepper-recipe';

export type MeeshyStepperStateLabels = { readonly done: string; readonly current: string; readonly todo: string };

export type MeeshyStepperProps = {
  readonly value: number;
  readonly label: string;
  readonly onChange?: ((value: number) => void) | undefined;
  readonly kind?: MeeshyStepperKind | undefined;
  readonly range?: MeeshyStepperRange | undefined;
  readonly step?: number | undefined;
  readonly stepLadder?: MeeshyStepperLadder | undefined;
  readonly repeatsOnHold?: boolean | undefined;
  readonly stops?: readonly MeeshyStepperStop[] | undefined;
  readonly spokenValue?: string | undefined;
  readonly decrementLabel?: string | undefined;
  readonly incrementLabel?: string | undefined;
  readonly minimumLabel?: string | undefined;
  readonly maximumLabel?: string | undefined;
  readonly describeStop?: ((stop: MeeshyStepperStop, index: number, count: number) => string) | undefined;
  readonly stateLabels?: MeeshyStepperStateLabels | undefined;
  readonly size?: MeeshyStepperSize | undefined;
  readonly tint?: string | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly animatesOnAppear?: boolean | undefined;
  readonly onBound?: (() => void) | undefined;
  readonly valueContent?: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string | undefined;
};

const isRightToLeft = (): boolean => typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const defaultDescribeStop = (stop: MeeshyStepperStop, index: number, count: number): string => `${stop.title}, ${index + 1} / ${count}`;

const glyph = (path: string): ReactNode => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const MINUS = glyph('M3.5 8h9');
const PLUS = glyph('M3.5 8h9M8 3.5v9');

type Bound = 'min' | 'max' | null;

/** L'appui long : un pas à l'appui, puis la répétition après le délai ; aucune minuterie ne survit au relâcher, à la butée, ni au démontage. */
function useStepper(props: MeeshyStepperProps) {
  const { value, range, onChange, repeatsOnHold = true, isEnabled = true } = props;
  const current = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [bound, setBound] = useState<Bound>(null);

  useEffect(() => {
    current.current = value;
    setBound(null);
  }, [value]);

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const move = useCallback(
    (delta: number): boolean => {
      const live = latest.current;
      if (live.range === undefined) return false;
      const next = meeshyStepperNext({ value: current.current, delta, range: live.range, step: live.step, ladder: live.stepLadder });
      if (next.hitBound) {
        impact('rigid');
        setBound(delta > 0 ? 'max' : 'min');
        live.onBound?.();
        return false;
      }
      current.current = next.value;
      setBound(null);
      impact('light');
      live.onChange?.(next.value);
      return true;
    },
    [],
  );

  const tick = useCallback(
    (delta: number, count: number) => {
      const wait = count === 0 ? MEESHY_STEPPER_HOLD.delayMs : meeshyStepperHoldInterval(count - 1);
      timer.current = setTimeout(() => {
        if (move(delta)) tick(delta, count + 1);
        else stop();
      }, wait);
    },
    [move, stop],
  );

  const press = useCallback(
    (delta: number) => {
      if (!isEnabled || range === undefined || onChange === undefined) return;
      stop();
      if (move(delta) && repeatsOnHold) tick(delta, 0);
    },
    [isEnabled, range, onChange, move, stop, tick, repeatsOnHold],
  );

  return { press, release: stop, bound };
}

function StepButton({ kind, label, delta, isBound, isDisabled, stepper }: { readonly kind: 'minus' | 'plus'; readonly label: string; readonly delta: number; readonly isBound: boolean; readonly isDisabled: boolean; readonly stepper: ReturnType<typeof useStepper> }) {
  return (
    <button
      type="button"
      className="kit-stepper__button"
      data-kit-stepper-minus={kind === 'minus' ? '' : undefined}
      data-kit-stepper-plus={kind === 'plus' ? '' : undefined}
      data-bound={isBound ? '' : undefined}
      aria-label={label}
      aria-disabled={isBound ? 'true' : undefined}
      disabled={isDisabled}
      onPointerDown={() => stepper.press(delta)}
      onPointerUp={stepper.release}
      onPointerCancel={stepper.release}
      onPointerLeave={stepper.release}
      onBlur={stepper.release}
      onClick={(event) => {
        if (event.detail === 0 && !isDisabled) stepper.press(delta);
        if (event.detail === 0) stepper.release();
      }}
    >
      {kind === 'minus' ? MINUS : PLUS}
    </button>
  );
}

function Buttons(props: MeeshyStepperProps & { readonly canDecrement: boolean; readonly canIncrement: boolean }) {
  const { value, label, spokenValue, decrementLabel = '', incrementLabel = '', minimumLabel, maximumLabel, valueContent, isEnabled = true, canDecrement, canIncrement } = props;
  const stepper = useStepper(props);
  const boundText = stepper.bound === 'max' ? maximumLabel : stepper.bound === 'min' ? minimumLabel : undefined;
  const spoken = `${spokenValue ?? String(value)}${boundText === undefined ? '' : `, ${boundText}`}`;
  return (
    <div className="kit-stepper__capsule" role="group" aria-label={label}>
      <StepButton kind="minus" label={decrementLabel} delta={-1} isBound={!canDecrement} isDisabled={!isEnabled} stepper={stepper} />
      <span className="kit-stepper__value" data-kit-stepper-value="" aria-hidden="true">
        {valueContent ?? value}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {spoken}
      </span>
      <StepButton kind="plus" label={incrementLabel} delta={1} isBound={!canIncrement} isDisabled={!isEnabled} stepper={stepper} />
    </div>
  );
}

function Track({ value, label, stops, onChange, describeStop = defaultDescribeStop, isEnabled = true, fill }: MeeshyStepperProps & { readonly stops: readonly MeeshyStepperStop[]; readonly fill: number }) {
  const lastIndex = stops.length - 1;
  const choose = (index: number): void => {
    if (isEnabled && index !== value && index >= 0 && index <= lastIndex) onChange?.(index);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const forward = isRightToLeft() ? 'ArrowLeft' : 'ArrowRight';
    const backward = isRightToLeft() ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward || event.key === 'ArrowDown') choose(value + 1);
    else if (event.key === backward || event.key === 'ArrowUp') choose(value - 1);
    else return;
    event.preventDefault();
  };
  return (
    <div className="kit-stepper__track" role="radiogroup" aria-label={label} style={{ '--kit-stepper-count': stops.length, '--kit-stepper-fill': fill } as never}>
      <span className="kit-stepper__line" aria-hidden="true">
        <span className="kit-stepper__line-fill" />
      </span>
      {stops.map((stop, index) => (
        <button
          key={stop.id}
          type="button"
          role="radio"
          aria-checked={index === value}
          aria-label={describeStop(stop, index, stops.length)}
          tabIndex={index === value ? 0 : -1}
          disabled={!isEnabled}
          className="kit-stepper__stop"
          data-selected={index === value ? '' : undefined}
          onClick={() => choose(index)}
          onKeyDown={onKeyDown}
        >
          <span className="kit-stepper__cell" aria-hidden="true">
            <span className="kit-stepper__mark" data-kit-stepper-mark="" style={{ '--kit-stepper-mark': stepperRem(meeshyStepperMarkSize(stop.markSize)) } as never}>
              {stop.glyph ?? null}
            </span>
          </span>
          <span className="kit-stepper__stop-title" aria-hidden="true">
            {stop.title}
          </span>
        </button>
      ))}
    </div>
  );
}

function Milestones({ value, label, stops, stateLabels, drawsTrace, fill }: MeeshyStepperProps & { readonly stops: readonly MeeshyStepperStop[]; readonly drawsTrace: boolean; readonly fill: number }) {
  return (
    <ol className="kit-stepper__milestones" role="list" aria-label={label} style={{ '--kit-stepper-fill': fill } as never} {...(drawsTrace ? { 'data-enters': '' } : {})}>
      {stops.map((stop, index) => {
        const state = index < value ? 'done' : index === value ? 'current' : 'todo';
        return (
          <li key={stop.id} role="listitem" className="kit-stepper__milestone" data-state={state} aria-current={state === 'current' ? 'step' : undefined} style={{ '--kit-stepper-index': index } as never}>
            <span className="kit-stepper__disc" aria-hidden="true">
              {stop.glyph ?? null}
            </span>
            <span className="kit-stepper__milestone-title">{stop.title}</span>
            {stop.caption === undefined ? null : <span className="kit-stepper__milestone-caption">{stop.caption}</span>}
            {stateLabels === undefined ? null : <span className="sr-only">{stateLabels[state]}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Un pas-à-pas : trois dessins d'une seule idée — la valeur saute d'un cran au suivant.
 * Il tient ses bornes seul (le bouton s'atténue à la butée, reste focusable, et la voix
 * dit le MAXIMUM ATTEINT), n'annonce que la valeur, jamais le geste, et ne garde aucune
 * minuterie quand il quitte l'écran.
 */
export const MeeshyStepper = memo(function MeeshyStepper(props: MeeshyStepperProps) {
  const { kind = 'buttons', value, range, stops = [], size, tint, isEnabled, className, footer } = props;
  const reduceMotion = prefersReducedMotion();
  const recipe = meeshyStepperRecipe({ kind, size, value, range, stopCount: kind === 'buttons' ? undefined : stops.length, isEnabled, isRtl: isRightToLeft(), reduceMotion });
  if (!recipe.isRenderable) return null;
  return (
    <div className={className === undefined ? 'kit-stepper' : `kit-stepper ${className}`} data-kit-stepper="" data-kind={kind} data-size={size ?? 'regular'} style={meeshyStepperStyle(recipe, tint)}>
      {kind === 'buttons' ? <Buttons {...props} canDecrement={recipe.canDecrement} canIncrement={recipe.canIncrement} /> : null}
      {kind === 'track' ? <Track {...props} stops={stops} fill={recipe.fill} /> : null}
      {kind === 'milestones' ? <Milestones {...props} stops={stops} drawsTrace={recipe.drawsTrace} fill={recipe.fill} /> : null}
      {footer === undefined || footer === null ? null : <div className="kit-stepper__footer">{footer}</div>}
    </div>
  );
});
