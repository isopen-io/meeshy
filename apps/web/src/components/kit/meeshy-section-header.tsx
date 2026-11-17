import '@/styles/kit-section-header.css';
import '@/styles/kit-motion.css';
import { memo, useState, type ReactNode } from 'react';

import { MeeshySkeleton } from './meeshy-skeleton';
import {
  meeshySectionHeaderRecipe,
  meeshySectionHeaderStyle,
  type MeeshySectionHeaderForm,
  type MeeshySectionHeaderRule,
  type MeeshySectionHeaderSize,
  type MeeshySectionHeaderStep,
} from './meeshy-section-header-recipe';

export * from './meeshy-section-header-recipe';

export type MeeshySectionHeaderDisclosure = { readonly expanded: boolean; readonly controls?: string | undefined };

export type MeeshySectionHeaderProps = {
  readonly title: string;
  readonly form?: MeeshySectionHeaderForm | undefined;
  readonly size?: MeeshySectionHeaderSize | undefined;
  readonly count?: number | undefined;
  readonly isPending?: boolean | undefined;
  readonly isLive?: boolean | undefined;
  readonly liveLabel?: string | undefined;
  readonly index?: number | undefined;
  readonly step?: MeeshySectionHeaderStep | undefined;
  readonly stepLabel?: string | undefined;
  readonly rule?: MeeshySectionHeaderRule | undefined;
  readonly tint?: string | undefined;
  readonly level?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  readonly disclosure?: MeeshySectionHeaderDisclosure | undefined;
  readonly onToggle?: ((next: boolean) => void) | undefined;
  readonly isSticky?: boolean | undefined;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly className?: string | undefined;
};

const CHEVRON = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3l5 5-5 5" />
  </svg>
);

const CHECK = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

const separator = <span className="sr-only">, </span>;

function Lead({ form, step, index, leading }: { readonly form: MeeshySectionHeaderForm; readonly step: MeeshySectionHeaderStep; readonly index: number | undefined; readonly leading: ReactNode }) {
  const isStep = form === 'step';
  if (!isStep && (leading === undefined || leading === null)) return null;
  return (
    <span className="kit-section__lead" aria-hidden="true" data-kit-section-lead="" data-step={isStep ? step : undefined}>
      {isStep ? (step === 'done' ? CHECK : index) : leading}
    </span>
  );
}

function Title({ title, count, isPending, isLive, liveLabel, showsCount, stepLabel }: Pick<MeeshySectionHeaderProps, 'title' | 'count' | 'isPending' | 'isLive' | 'liveLabel' | 'stepLabel'> & { readonly showsCount: boolean }) {
  const hasCount = showsCount && count !== undefined && count > 0;
  const waits = showsCount && isPending === true && !hasCount;
  return (
    <>
      <span className="kit-section__title" data-kit-section-title="">
        {title}
      </span>
      {stepLabel === undefined ? null : (
        <>
          {separator}
          <span className="sr-only">{stepLabel}</span>
        </>
      )}
      {hasCount ? (
        <>
          {separator}
          <span className="kit-section__count" data-kit-section-count="">
            {count}
          </span>
        </>
      ) : null}
      {waits ? <MeeshySkeleton shape={{ kind: 'pill', width: 28, height: 16 }} /> : null}
      {isLive === true ? (
        <>
          {separator}
          {liveLabel === undefined ? null : <span className="sr-only">{liveLabel}</span>}
          <span className="kit-section__live" aria-hidden="true" data-kit-section-live="" />
        </>
      ) : null}
    </>
  );
}

/**
 * Un en-tête de section : une tête optionnelle, le titre, son compteur accolé et UN seul
 * accessoire de fin. Il se dit titre, au niveau demandé, avec son compteur puis son témoin
 * « en direct ». Repliable, toute la ligne est un seul bouton qui dit « développé » ou
 * « réduit » et demande l'état contraire : l'en-tête n'en garde aucun, l'hôte replie son
 * corps. Statique, la ligne ne répond pas — seul l'accessoire se touche.
 */
export const MeeshySectionHeader = memo(function MeeshySectionHeader({
  title,
  form,
  size,
  count,
  isPending,
  isLive,
  liveLabel,
  index,
  step,
  stepLabel,
  rule,
  tint,
  level = 2,
  disclosure,
  onToggle,
  isSticky,
  leading,
  trailing,
  className,
}: MeeshySectionHeaderProps) {
  if (title === '') throw new Error('MeeshySectionHeader : le titre est obligatoire et déjà traduit.');
  const [isPressed, setPressed] = useState(false);
  const recipe = meeshySectionHeaderRecipe({ form, size, step, rule, tint, isExpanded: disclosure?.expanded, isPressed, isSticky });
  const toggles = disclosure !== undefined && onToggle !== undefined;
  const heading = (
    <>
      {recipe.showsLead ? <Lead form={recipe.form} step={recipe.step} index={index} leading={leading} /> : null}
      <Title title={title} count={count} isPending={isPending} isLive={isLive} liveLabel={liveLabel} stepLabel={stepLabel} showsCount={recipe.showsCount} />
    </>
  );
  return (
    <div
      className={className === undefined ? 'kit-section' : `kit-section ${className}`}
      style={meeshySectionHeaderStyle(recipe, tint)}
      data-kit-section-header=""
      data-form={recipe.form}
      data-rule={recipe.showsRules ? recipe.rule : undefined}
      data-glass={recipe.hasGlass ? '' : undefined}
    >
      {recipe.showsRules && recipe.rule === 'centered' ? <span className="kit-section__rule" aria-hidden="true" /> : null}
      <div className="kit-section__heading" role="heading" aria-level={level}>
        {toggles ? (
          <button
            type="button"
            className="kit-section__toggle"
            data-kit-section-toggle=""
            aria-expanded={disclosure.expanded}
            aria-controls={disclosure.controls}
            onClick={() => onToggle(!disclosure.expanded)}
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
          >
            {heading}
            <span className="kit-section__chevron" aria-hidden="true" data-kit-section-chevron="">
              {CHEVRON}
            </span>
          </button>
        ) : (
          heading
        )}
      </div>
      {recipe.showsRules ? <span className="kit-section__rule" aria-hidden="true" /> : null}
      {!toggles && trailing !== undefined && trailing !== null ? <div className="kit-section__trailing">{trailing}</div> : null}
    </div>
  );
});
