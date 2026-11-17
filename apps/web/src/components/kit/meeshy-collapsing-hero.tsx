import '@/styles/kit-collapsing-hero.css';
import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import { MeeshyGlass, type MeeshyGlassTone } from './meeshy-glass-tone';
import {
  meeshyCollapsingHeroProgress,
  meeshyCollapsingHeroRecipe,
  meeshyCollapsingHeroSnapTarget,
  meeshyCollapsingHeroStyle,
  type MeeshyCollapsingHeroAlignment,
  type MeeshyCollapsingHeroSnap,
  type MeeshyCollapsingHeroVariant,
} from './meeshy-collapsing-hero-recipe';
import { MeeshySkeleton } from './meeshy-skeleton';

export * from './meeshy-collapsing-hero-recipe';

export type MeeshyCollapsingHeroProps = {
  readonly progress: number;
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly banner?: ReactNode;
  readonly avatar?: ((size: number) => ReactNode) | undefined;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly variant?: MeeshyCollapsingHeroVariant | undefined;
  readonly alignment?: MeeshyCollapsingHeroAlignment | undefined;
  readonly expandedHeight?: number | undefined;
  readonly collapsedHeight?: number | undefined;
  readonly tone?: MeeshyGlassTone | undefined;
  readonly isLoading?: boolean | undefined;
  readonly onCollapsedTap?: (() => void) | undefined;
  readonly backToTopLabel?: string | undefined;
  readonly className?: string | undefined;
};

const has = (slot: ReactNode): boolean => slot !== undefined && slot !== null && slot !== false;

/**
 * Un héros qui se replie : six emplacements, deux hauteurs, UN avatar et UN titre (un `h1`,
 * lu une fois avec son sous-titre) qui voyagent de la bannière vers la barre. La barre de
 * verre vient de K01. Replié, la barre est un bouton nommé qui rend la main à l'hôte. Seules
 * des transformations et des opacités changent pendant le geste.
 */
export const MeeshyCollapsingHero = memo(function MeeshyCollapsingHero({
  progress,
  title,
  subtitle,
  banner,
  avatar,
  leading,
  trailing,
  variant = 'hero',
  alignment,
  expandedHeight,
  collapsedHeight,
  tone,
  isLoading,
  onCollapsedTap,
  backToTopLabel,
  className,
}: MeeshyCollapsingHeroProps) {
  if (title === '') throw new Error('MeeshyCollapsingHero : le titre est obligatoire et déjà traduit.');
  const isBar = variant !== 'hero';
  const recipe = meeshyCollapsingHeroRecipe({ progress: isBar ? 1 : progress, expandedHeight, collapsedHeight, alignment, hasAvatar: avatar !== undefined, hasSubtitle: subtitle !== undefined });
  const classes = ['kit-hero', ...(className === undefined ? [] : [className])].join(' ');
  const style = meeshyCollapsingHeroStyle(recipe) as CSSProperties;
  const hero = variant === 'hero';
  return (
    <header className={classes} style={style} data-kit-hero="" data-variant={variant} data-bar-owns={recipe.barOwnsIdentity ? '' : undefined} data-alignment={alignment ?? 'leading'} data-loading={isLoading === true ? '' : undefined}>
      {hero ? (
        <div className="kit-hero__banner" data-kit-hero-banner="">
          {isLoading === true ? <MeeshySkeleton shape={{ kind: 'card', aspect: 1, radius: 0 }} /> : banner}
        </div>
      ) : null}
      <MeeshyGlass {...(tone === undefined ? {} : { tone })} className="kit-hero__glass" aria-hidden="true" data-kit-hero-glass="" />
      {has(leading) ? (
        <div className="kit-hero__slot" data-slot="leading" data-kit-hero-leading="" style={{ '--kit-hero-target': style['--kit-hero-target' as keyof CSSProperties] } as CSSProperties}>
          {leading}
        </div>
      ) : null}
      {has(trailing) ? (
        <div className="kit-hero__slot" data-slot="trailing" data-kit-hero-trailing="" style={{ '--kit-hero-target': style['--kit-hero-target' as keyof CSSProperties] } as CSSProperties}>
          {trailing}
        </div>
      ) : null}
      {avatar === undefined || variant === 'bar' ? null : (
        <div className="kit-hero__avatar" data-kit-hero-avatar="">
          {avatar(Math.round(recipe.avatar.size))}
        </div>
      )}
      <h1 className="kit-hero__title" data-kit-hero-title="">
        <span className="kit-hero__name">{title}</span>
        {subtitle === undefined ? null : <span className="kit-hero__subtitle">{subtitle}</span>}
      </h1>
      {recipe.barOwnsIdentity && onCollapsedTap !== undefined ? <button type="button" className="kit-hero__bar-hit" data-kit-hero-bar-hit="" aria-label={backToTopLabel} onClick={onCollapsedTap} /> : null}
    </header>
  );
});

export type MeeshyCollapsingHeroPageProps = Omit<MeeshyCollapsingHeroProps, 'progress' | 'onCollapsedTap'> & {
  readonly snap?: MeeshyCollapsingHeroSnap | undefined;
  readonly children?: ReactNode;
};

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * La page qui mesure le défilement et donne `progress` au héros. Le contenu suit le doigt à
 * 1 px pour 1 px ; l'avancée est lue par image (un seul rendu d'en-tête par image, jamais celui
 * des enfants : leur identité d'élément ne change pas). L'aimant ramène au cran le plus
 * proche au relâcher ; un tic léger marque l'épinglage, un seul par sens.
 */
export function MeeshyCollapsingHeroPage({ snap = 'nearest', children, ...hero }: MeeshyCollapsingHeroPageProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const recipe = meeshyCollapsingHeroRecipe({ progress: 0, expandedHeight: hero.expandedHeight, collapsedHeight: hero.collapsedHeight });
  useEffect(() => {
    const node = scroller.current;
    if (node === null) return;
    let frame = 0;
    let settle = 0;
    let isPinned = false;
    const read = (): void => {
      frame = 0;
      const next = meeshyCollapsingHeroProgress(node.scrollTop, recipe);
      setProgress(next);
      const pinned = next >= 1;
      if (pinned !== isPinned) {
        isPinned = pinned;
        impact('light');
      }
    };
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(read);
      if (snap !== 'nearest') return;
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        const target = meeshyCollapsingHeroSnapTarget(node.scrollTop, recipe);
        if (target !== node.scrollTop) node.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }, 140);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [recipe.scrollDistance, snap]);
  const toTop = (): void => scroller.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  return (
    <div className="kit-hero-page" ref={scroller} data-kit-hero-page="">
      <div className="kit-hero-page__hero">
        <MeeshyCollapsingHero {...hero} progress={progress} onCollapsedTap={toTop} />
      </div>
      <div className="kit-hero-page__content" style={{ '--kit-hero-identity': `${recipe.expandedWithIdentity / 16}rem` } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}
