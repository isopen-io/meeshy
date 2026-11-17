import '@/styles/kit-ticket.css';
import '@/styles/kit-motion.css';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import { MeeshySkeleton } from './meeshy-skeleton';
import { MEESHY_TICKET_MEASURE, meeshyTicketRecipe, meeshyTicketStyle, type MeeshyTicketKind, type MeeshyTicketSize } from './meeshy-ticket-recipe';

export * from './meeshy-ticket-recipe';

export type MeeshyTicketFlipLabels = { readonly front: string; readonly back: string };

export type MeeshyTicketProps = {
  readonly title: string;
  readonly code: string;
  readonly tint?: string | undefined;
  readonly glyph?: ReactNode;
  readonly figure?: string | undefined;
  readonly figureCaption?: string | undefined;
  readonly size?: MeeshyTicketSize | undefined;
  readonly kind?: MeeshyTicketKind | undefined;
  readonly statusLabel?: string | undefined;
  readonly isSelected?: boolean | undefined;
  readonly selectedLabel?: string | undefined;
  readonly isDragging?: boolean | undefined;
  readonly isFlipped?: boolean | undefined;
  readonly onFlippedChange?: ((next: boolean) => void) | undefined;
  readonly flipLabels?: MeeshyTicketFlipLabels | undefined;
  readonly codeTinted?: boolean | undefined;
  readonly stub?: ReactNode;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly status?: ReactNode;
  readonly back?: ReactNode;
  readonly label?: string | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
};

const has = (slot: ReactNode): boolean => slot !== undefined && slot !== null && slot !== false;

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CHECK = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

/**
 * Le retournement : `isFlipped` en est la seule cause. Le verso n'est construit qu'au premier
 * retournement (le conteneur existe, inerte, son contenu non). Au retournement, un tic rigide
 * à la tranche, une fois, et le mot du côté s'annonce poliment.
 */
function useFlip(isFlipped: boolean, hasBack: boolean, labels: MeeshyTicketFlipLabels | undefined) {
  const flipped = isFlipped && hasBack;
  const [hasFlipped, setHasFlipped] = useState(flipped);
  const [said, setSaid] = useState('');
  const previous = useRef(flipped);
  useEffect(() => {
    if (flipped) setHasFlipped(true);
    if (previous.current === flipped) return;
    previous.current = flipped;
    setSaid(labels === undefined ? '' : flipped ? labels.back : labels.front);
    if (prefersReducedMotion()) return;
    const timer = window.setTimeout(() => impact('rigid'), MEESHY_TICKET_MEASURE.flipMidpointMs);
    return () => window.clearTimeout(timer);
  }, [flipped, labels]);
  return { flipped, hasFlipped, said };
}

/**
 * Un billet : un seul élément nommé (titre, code, chiffre, puis l'état en mots), une seule
 * forme découpée par un masque. Avec `onPress`, un seul bouton étiré dessous, jamais un bouton
 * dans un bouton : presser un bouton du talon ne presse pas le billet. Le code reste de
 * gauche à droite et n'est jamais traduit. Le côté caché du retournement n'est ni touchable
 * ni lu.
 */
export const MeeshyTicket = memo(function MeeshyTicket({
  title,
  code,
  tint,
  glyph,
  figure,
  figureCaption,
  size,
  kind,
  statusLabel,
  isSelected,
  selectedLabel,
  isDragging,
  isFlipped = false,
  flipLabels,
  codeTinted,
  stub,
  leading,
  trailing,
  status,
  back,
  label,
  onPress,
  disabled,
  className,
}: MeeshyTicketProps) {
  if (title === '') throw new Error('MeeshyTicket : le titre est obligatoire.');
  if (code === '') throw new Error('MeeshyTicket : le code est obligatoire.');
  if ((kind === 'ghost' || kind === 'struck') && (statusLabel === undefined || statusLabel === '')) throw new Error('MeeshyTicket : un billet fantôme ou barré demande le mot écrit de son état.');
  const [isPressed, setPressed] = useState(false);
  const recipe = meeshyTicketRecipe({ size, kind, tint, isSelected, isPressed, isDragging, isFlipped: isFlipped && back !== undefined, reduceMotion: prefersReducedMotion() });
  const { flipped, hasFlipped, said } = useFlip(isFlipped, has(back), flipLabels);
  const isLoading = recipe.kind === 'loading';
  const phrase = label ?? [title, code, figure === undefined ? undefined : `${figure}${figureCaption === undefined ? '' : ` ${figureCaption}`}`, statusLabel, isSelected === true ? selectedLabel : undefined].filter((part): part is string => part !== undefined && part !== '').join(', ');
  const classes = ['kit-ticket', ...(className === undefined ? [] : [className])].join(' ');
  const showsBadge = recipe.badge > 0 && (has(glyph) || tint !== undefined);
  return (
    <article
      className={classes}
      style={meeshyTicketStyle(recipe)}
      data-kit-ticket=""
      data-size={recipe.size}
      data-kind={recipe.kind}
      data-fill={recipe.fill}
      data-border-style={recipe.borderStyle}
      data-flip={recipe.flip}
      data-flipped={flipped ? '' : undefined}
      data-selected={isSelected === true ? '' : undefined}
      data-dragging={isDragging === true ? '' : undefined}
      data-pressed={isPressed ? '' : undefined}
      data-struck={recipe.strikesText ? '' : undefined}
      data-code-tinted={codeTinted === true ? '' : undefined}
    >
      <div className="kit-ticket__faces">
        <div className="kit-ticket__face kit-ticket__front" data-kit-ticket-front="" aria-hidden={flipped ? 'true' : undefined} {...(flipped ? { inert: true } : {})}>
          {onPress === undefined ? null : (
            <button
              type="button"
              className="kit-ticket__hit"
              data-kit-ticket-hit=""
              aria-label={phrase}
              aria-pressed={isSelected === undefined ? undefined : isSelected}
              aria-disabled={disabled === true ? true : undefined}
              onClick={() => disabled !== true && onPress()}
              onPointerDown={() => setPressed(true)}
              onPointerUp={() => setPressed(false)}
              onPointerLeave={() => setPressed(false)}
              onPointerCancel={() => setPressed(false)}
            />
          )}
          {isLoading ? (
            <MeeshySkeleton shape={{ kind: 'ticket', height: recipe.cut + 60, cut: recipe.cut }} />
          ) : (
            <>
              <div className="kit-ticket__body" {...(onPress === undefined ? {} : { 'aria-hidden': 'true' as const })}>
                {has(leading) ? <span className="kit-ticket__leading">{leading}</span> : null}
                {showsBadge ? (
                  <span className="kit-ticket__badge" data-off={recipe.badgeOff ? '' : undefined} aria-hidden="true">
                    {glyph}
                  </span>
                ) : null}
                <div className="kit-ticket__text">
                  <span className="kit-ticket__title">
                    {title}
                    {has(status) ? <span className="kit-ticket__status">{status}</span> : null}
                  </span>
                  {recipe.showsCode ? (
                    <span className="kit-ticket__code" data-kit-ticket-code="" dir="ltr" translate="no">
                      {code}
                    </span>
                  ) : null}
                  {statusLabel === undefined ? null : <span className="kit-ticket__state">{statusLabel}</span>}
                </div>
                {figure === undefined || !recipe.showsFigure ? null : (
                  <span className="kit-ticket__figure">
                    <span className="kit-ticket__figure-value">{figure}</span>
                    {figureCaption === undefined ? null : <span className="kit-ticket__figure-caption">{figureCaption}</span>}
                  </span>
                )}
              </div>
              {isSelected === true ? (
                <span className="kit-ticket__check" aria-hidden="true">
                  {CHECK}
                </span>
              ) : recipe.showsTrailing && has(trailing) ? (
                <div className="kit-ticket__trailing">{trailing}</div>
              ) : null}
              {isSelected === true && selectedLabel !== undefined ? <span className="sr-only">{selectedLabel}</span> : null}
              <span className="kit-ticket__cut" aria-hidden="true" />
              {has(stub) ? (
                <div className="kit-ticket__stub" data-kit-ticket-stub="">
                  {stub}
                </div>
              ) : null}
            </>
          )}
        </div>
        {has(back) ? (
          <div className="kit-ticket__face kit-ticket__back" data-kit-ticket-back="" aria-hidden={flipped ? undefined : 'true'} {...(flipped ? {} : { inert: true })}>
            {hasFlipped ? back : null}
          </div>
        ) : null}
      </div>
      <span className="sr-only" role="status" aria-live="polite" data-kit-ticket-announce="">
        {said}
      </span>
    </article>
  );
});
