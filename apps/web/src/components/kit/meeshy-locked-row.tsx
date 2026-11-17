import '@/styles/kit-locked-row.css';
import '@/styles/kit-motion.css';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';

import { success } from '@/lib/view/haptics';

import {
  meeshyLockedRowRecipe,
  meeshyLockedRowStyle,
  type MeeshyLockedRowForm,
  type MeeshyLockedRowRecipe,
  type MeeshyLockedRowWords,
} from './meeshy-locked-row-recipe';

export * from './meeshy-locked-row-recipe';

export type MeeshyLockedRowAction = {
  readonly title: string;
  readonly isPending?: boolean | undefined;
  readonly isDone?: boolean | undefined;
  readonly perform: () => void;
};

export type MeeshyLockedRowProps = {
  readonly title: string;
  readonly requirement: string;
  readonly words: MeeshyLockedRowWords;
  readonly glyph?: ReactNode;
  readonly requirementGlyph?: ReactNode;
  readonly trailing?: ReactNode;
  readonly action?: MeeshyLockedRowAction | undefined;
  readonly form?: MeeshyLockedRowForm | undefined;
  readonly tint?: string | undefined;
  readonly isOpen?: boolean | undefined;
  readonly isUnlocking?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly onUnlocked?: (() => void) | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly label?: string | undefined;
  readonly haptic?: 'onUnlock' | 'none' | undefined;
  readonly className?: string | undefined;
};

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const LOCK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);

function Lock({ size }: { readonly size: number }) {
  return (
    <span className="kit-locked__lock" data-kit-lock="" aria-hidden="true" style={{ inlineSize: `${size / 16}rem`, blockSize: `${size / 16}rem` }}>
      {LOCK}
    </span>
  );
}

/**
 * L'ouverture, une fois : quand l'hôte passe `isUnlocking` à vrai (la porte vient de
 * s'ouvrir pour de bon), le tic de succès part, l'ouverture se joue, puis `onUnlocked`
 * part UNE fois. Un second rendu à valeur égale ne rejoue rien ; une rangée qui disparaît
 * avant la fin n'appelle rien (la minuterie est rendue au démontage). Hors ouverture, la
 * région polie se vide et le compte repart : une seconde ouverture se joue et se dit.
 */
function useUnlocking(props: MeeshyLockedRowProps, recipe: MeeshyLockedRowRecipe): string {
  const { isUnlocking, title, words, haptic = 'onUnlock' } = props;
  const [said, setSaid] = useState('');
  const fired = useRef(false);
  const latest = useRef(props.onUnlocked);
  latest.current = props.onUnlocked;
  const unlockMs = recipe.unlockMs;
  useEffect(() => {
    if (isUnlocking !== true) {
      fired.current = false;
      setSaid('');
      return undefined;
    }
    if (fired.current) return undefined;
    setSaid(`${title}, ${words.unlocked}`);
    if (haptic !== 'none') success();
    const timer = setTimeout(() => {
      fired.current = true;
      latest.current?.();
    }, unlockMs);
    return () => clearTimeout(timer);
  }, [isUnlocking, title, words.unlocked, haptic, unlockMs]);
  return said;
}

function ActionButton({ action, isEnabled, words }: { readonly action: MeeshyLockedRowAction; readonly isEnabled: boolean; readonly words: MeeshyLockedRowWords }) {
  const isPending = action.isPending === true;
  return (
    <button
      type="button"
      className="kit-locked__action"
      data-kit-locked-action=""
      data-pending={isPending ? '' : undefined}
      aria-label={isPending ? `${action.title}, ${words.pending}` : undefined}
      aria-disabled={isPending ? 'true' : undefined}
      disabled={action.isDone === true || !isEnabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!isPending) action.perform();
      }}
    >
      {action.title}
    </button>
  );
}

function Requirement({ placement, text, glyph }: { readonly placement: MeeshyLockedRowRecipe['requirementPlacement']; readonly text: string; readonly glyph: ReactNode }) {
  return (
    <span className="kit-locked__requirement" data-placement={placement} data-kit-locked-requirement="">
      {glyph}
      {text}
    </span>
  );
}

function Body({ props, recipe }: { readonly props: MeeshyLockedRowProps; readonly recipe: MeeshyLockedRowRecipe }) {
  const { title, requirement, glyph, requirementGlyph, trailing, isOpen = false } = props;
  const isInline = recipe.form === 'inline';
  const showsGlyph = !isInline && glyph !== undefined && glyph !== null && (recipe.form === 'tile' || isOpen);
  return (
    <>
      {recipe.showsLock && recipe.form !== 'tile' ? <Lock size={recipe.lockSize} /> : null}
      {showsGlyph ? <span className="kit-locked__glyph" data-kit-locked-glyph="">{glyph}</span> : null}
      <span className="kit-locked__text">
        <span className="kit-locked__title">{title}</span>
        {isOpen ? null : <Requirement placement={recipe.requirementPlacement} text={requirement} glyph={requirementGlyph} />}
      </span>
      {recipe.showsLock && recipe.form === 'tile' ? <Lock size={recipe.lockSize} /> : null}
      {trailing === undefined || trailing === null ? null : <span className="kit-locked__trailing">{trailing}</span>}
    </>
  );
}

/**
 * Une rangée verrouillée : un fantôme qui dit ce qui est fermé, ce qui l'ouvre, et propose
 * le geste. Sans `onPress`, un texte (nom dit « Présence, verrouillé, dès Ami ») ; avec, un
 * bouton ; le geste est toujours un VRAI second bouton, nommé par son titre.
 */
export const MeeshyLockedRow = memo(function MeeshyLockedRow(props: MeeshyLockedRowProps) {
  const { title, requirement, words, form, tint, action, isOpen = false, isUnlocking, isEnabled = true, onPress, label, className } = props;
  if (title === '') throw new Error('MeeshyLockedRow : le titre est obligatoire et déjà traduit.');
  const recipe = meeshyLockedRowRecipe({ form, hasAction: action !== undefined, isOpen, isEnabled, isUnlocking, reduceMotion: prefersReducedMotion() });
  const said = useUnlocking(props, recipe);
  const name = label ?? (isOpen ? `${title}, ${words.unlocked}` : `${title}, ${words.locked}, ${requirement}`);
  const hasAction = action !== undefined && recipe.form !== 'inline';
  const rootProps = {
    className: className === undefined ? 'kit-locked' : `kit-locked ${className}`,
    style: meeshyLockedRowStyle(recipe, tint),
    'data-kit-locked-row': '',
    'data-form': recipe.form,
    'data-border': recipe.border,
    'data-open': isOpen ? '' : undefined,
    'data-unlocking': isUnlocking === true ? '' : undefined,
  };
  const status = (
    <span className="sr-only" role="status" aria-live="polite">
      {said}
    </span>
  );

  if (onPress !== undefined && !hasAction) {
    return (
      <button type="button" {...rootProps} aria-label={name} onClick={onPress}>
        <Body props={props} recipe={recipe} />
        {status}
      </button>
    );
  }
  return (
    <div {...rootProps} role="group" aria-label={name}>
      {onPress === undefined ? (
        <span className="kit-locked__body" aria-hidden="true">
          <Body props={props} recipe={recipe} />
        </span>
      ) : (
        <button type="button" className="kit-locked__body kit-locked__press" aria-label={name} onClick={onPress}>
          <Body props={props} recipe={recipe} />
        </button>
      )}
      {hasAction ? <ActionButton action={action} isEnabled={isEnabled} words={words} /> : null}
      {status}
    </div>
  );
});

export type MeeshyLockedGroupProps = {
  readonly title: string;
  readonly requirement: string;
  readonly count: number;
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly words: MeeshyLockedRowWords;
  readonly tint?: string | undefined;
  readonly children?: ReactNode;
};

const MAX_STACKED_LOCKS = 3;

/** Plusieurs choses, une même exigence : replié, une rangée ; déplié, l'exigence n'est dite qu'une fois. */
export function MeeshyLockedGroup({ title, requirement, count, expanded, onExpandedChange, words, tint, children }: MeeshyLockedGroupProps) {
  const recipe = meeshyLockedRowRecipe({ form: 'row' });
  const stacked = Math.min(Math.max(count, 1), MAX_STACKED_LOCKS);
  return (
    <div className="kit-locked-group" data-kit-locked-group="" data-expanded={expanded ? '' : undefined} style={meeshyLockedRowStyle(recipe, tint)}>
      <button type="button" className="kit-locked kit-locked__header" data-form="row" data-border="dashed" aria-expanded={expanded} aria-label={`${title}, ${words.locked}, ${requirement}`} onClick={() => onExpandedChange(!expanded)}>
        <span className="kit-locked__stack">
          {Array.from({ length: stacked }, (_, index) => (
            <Lock key={index} size={recipe.lockSize} />
          ))}
        </span>
        <span className="kit-locked__text">
          <span className="kit-locked__title">{title}</span>
          <Requirement placement="chip" text={requirement} glyph={null} />
        </span>
        <span className="kit-locked__chevron" aria-hidden="true" data-expanded={expanded ? '' : undefined}>
          ▾
        </span>
      </button>
      {expanded ? <div className="kit-locked-group__items">{children}</div> : null}
    </div>
  );
}
