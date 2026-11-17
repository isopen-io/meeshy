import '@/styles/kit-state-block.css';
import '@/styles/kit-motion.css';
import { memo, useEffect, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import { MeeshyButton } from './meeshy-button';
import {
  meeshyStateBlockRecipe,
  meeshyStateBlockStyle,
  meeshyStateGhostCount,
  type MeeshyStateArt,
  type MeeshyStateBlockKind,
  type MeeshyStateBlockSize,
} from './meeshy-state-block-recipe';

export * from './meeshy-state-block-recipe';

export type MeeshyStateBlockAction = {
  readonly title: string;
  readonly glyph?: ReactNode;
  readonly isPending?: boolean | undefined;
  readonly perform: () => void;
};

export type MeeshyStateBlockProps = {
  readonly kind: MeeshyStateBlockKind;
  readonly title: string;
  readonly message?: string | undefined;
  readonly primary?: MeeshyStateBlockAction | undefined;
  readonly secondary?: MeeshyStateBlockAction | undefined;
  readonly art?: MeeshyStateArt | undefined;
  readonly glyph?: ReactNode;
  readonly consequences?: readonly string[] | undefined;
  readonly isOverContent?: boolean | undefined;
  readonly size?: MeeshyStateBlockSize | undefined;
  readonly tint?: string | undefined;
  readonly announces?: boolean | undefined;
  readonly label?: string | undefined;
  readonly pendingLabel?: string | undefined;
  readonly hapticOnError?: boolean | undefined;
  readonly className?: string | undefined;
};

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const KIND_PATH: Readonly<Record<MeeshyStateBlockKind, string>> = {
  empty: 'M4 8.5h16M7 4.5h10l3 4v10H4v-10l3-4z',
  error: 'M12 7v6M12 16.5h.01M3.5 19L12 4l8.5 15z',
  denied: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM6 6l12 12',
  offline: 'M4 9a12 12 0 0116 0M7 12.5a8 8 0 0110 0M10 16a4 4 0 014 0M12 19.5h.01M4 4l16 16',
  success: 'M5 12.5l4.5 4.5L19 7.5',
};

const DefaultGlyph = ({ kind }: { readonly kind: MeeshyStateBlockKind }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={KIND_PATH[kind]} />
  </svg>
);

function Ghost({ template, count }: { readonly template: string; readonly count: number }) {
  return (
    <span className="kit-state__ghosts" aria-hidden="true" data-kit-state-art="" data-template={template}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="kit-state__ghost" data-kit-state-ghost="" data-template={template} />
      ))}
    </span>
  );
}

function Exit({ action, kind, pendingLabel, isSecondary }: { readonly action: MeeshyStateBlockAction; readonly kind: 'primary' | 'text'; readonly pendingLabel: string | undefined; readonly isSecondary: boolean }) {
  const isPending = action.isPending === true;
  return (
    <MeeshyButton
      title={action.title}
      kind={kind}
      glyph={action.glyph}
      isPending={isPending}
      disabled={isPending}
      pendingLabel={pendingLabel}
      size={isSecondary ? 44 : 50}
      onPress={action.perform}
      className={isSecondary ? 'kit-state__secondary' : 'kit-state__primary'}
    />
  );
}

/**
 * Un bloc d'état : la silhouette de ce qui manque, une phrase, une sortie. Un seul élément
 * pour la voix (le titre puis la phrase) ; l'image et le halo se taisent ; une erreur est une
 * alerte dite une fois. Sans la sortie que la loi exige, il ne se dessine pas : un vide sans
 * issue est un cul-de-sac, une erreur sans « Réessayer » une impasse.
 */
export const MeeshyStateBlock = memo(function MeeshyStateBlock(props: MeeshyStateBlockProps) {
  const { kind, title, message, primary, secondary, art, glyph, consequences, isOverContent, size, tint, announces = true, label, pendingLabel, hapticOnError = true, className } = props;
  const recipe = meeshyStateBlockRecipe({ kind, size, hasPrimary: primary !== undefined, hasSecondary: secondary !== undefined, hasMessage: message !== undefined, isOverContent, tint, reduceMotion: prefersReducedMotion() });
  const isResolvable = recipe.isResolvable;
  const entersAsError = isResolvable && recipe.hapticOnEnter && hapticOnError;
  useEffect(() => {
    if (entersAsError) impact('rigid');
  }, [entersAsError]);
  if (!isResolvable) return null;
  const effectiveArt = art ?? { ghost: 'line' as const, count: 3 };
  const shownConsequences = kind === 'success' ? (consequences ?? []).slice(0, 4) : [];
  const exits = primary === undefined ? secondary : primary;
  const second = primary === undefined ? undefined : secondary;
  const classes = ['kit-state', className].filter((part): part is string => part !== undefined).join(' ');
  return (
    <div
      className={classes}
      role={announces ? recipe.role : undefined}
      data-kit-state-block=""
      data-kind={kind}
      data-size={recipe.size}
      data-tone={recipe.glyphTone}
      data-shakes={recipe.shakes ? '' : undefined}
      data-breathes={recipe.breathes ? '' : undefined}
      style={meeshyStateBlockStyle(recipe)}
    >
      {recipe.hasHalo ? <span className="kit-state__halo" aria-hidden="true" data-kit-state-halo="" /> : null}
      {recipe.size === 'regular' && !isOverContent ? (
        effectiveArt === 'none' ? null : effectiveArt === 'glyph' || recipe.hasGhost === false ? null : <Ghost template={effectiveArt.ghost} count={meeshyStateGhostCount(effectiveArt.count)} />
      ) : null}
      {recipe.size === 'regular' && effectiveArt !== 'none' && !isOverContent ? (
        <span className="kit-state__glyph" aria-hidden="true" data-kit-state-art-glyph="">
          {glyph ?? <DefaultGlyph kind={kind} />}
        </span>
      ) : null}
      <span className="kit-state__text" data-kit-state-text="">
        {label === undefined ? null : <span className="sr-only">{label}</span>}
        <span className="kit-state__title" aria-hidden={label === undefined ? undefined : 'true'}>{title}</span>
        {message === undefined || recipe.size === 'compact' ? null : (
          <span className="kit-state__message" aria-hidden={label === undefined ? undefined : 'true'}>
            <span className="sr-only">, </span>
            {message}
          </span>
        )}
      </span>
      {shownConsequences.length === 0 ? null : (
        <ul className="kit-state__consequences" role="list">
          {shownConsequences.map((line) => (
            <li key={line} data-kit-state-consequence="">
              {line}
            </li>
          ))}
        </ul>
      )}
      {exits === undefined ? null : <Exit action={exits} kind="primary" pendingLabel={pendingLabel} isSecondary={false} />}
      {second === undefined ? null : <Exit action={second} kind="text" pendingLabel={pendingLabel} isSecondary />}
    </div>
  );
});
