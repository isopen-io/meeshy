import '@/styles/kit-key-hint.css';
import type { ReactNode } from 'react';

import {
  meeshyKeyHintGlyphs,
  meeshyKeyHintHasKeyboard,
  meeshyKeyHintPlatform,
  meeshyKeyHintRecipe,
  meeshyKeyHintShortcut,
  meeshyKeyHintShown,
  meeshyKeyHintStyle,
  type MeeshyKeyCombo,
  type MeeshyKeyHintContext,
  type MeeshyKeyHintSize,
  type MeeshyKeyHintSurface,
  type MeeshyKeyPlatform,
} from './meeshy-key-hint-recipe';
import { MeeshyGlass } from './meeshy-glass-tone';

export * from './meeshy-key-hint-recipe';

const isRightToLeft = (): boolean => typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

type Environment = { readonly platform?: MeeshyKeyPlatform | undefined; readonly hasKeyboard?: boolean | undefined; readonly isEnabled?: boolean | undefined };

const isShown = ({ hasKeyboard, isEnabled }: Environment): boolean =>
  meeshyKeyHintShown({ hasKeyboard: hasKeyboard ?? meeshyKeyHintHasKeyboard(), isEnabled: isEnabled ?? true });

export type MeeshyKeyHintProps = Environment & {
  readonly keys: MeeshyKeyCombo;
  readonly context?: MeeshyKeyHintContext | undefined;
  readonly size?: MeeshyKeyHintSize | undefined;
  readonly surface?: MeeshyKeyHintSurface | undefined;
  readonly isPressed?: boolean | undefined;
};

/**
 * Une combinaison de touches accolées : masquée à la voix (l'hôte la dit par
 * `aria-keyshortcuts`, tiré de la même valeur), sans cible, sans focus, sans écouteur.
 * Sans clavier, sur une commande désactivée ou sans touche : aucun nœud, aucune place.
 */
export function MeeshyKeyHint({ keys, context, size, surface, isPressed, platform, hasKeyboard, isEnabled }: MeeshyKeyHintProps) {
  if (keys.length === 0 || !isShown({ hasKeyboard, isEnabled })) return null;
  const resolved = platform ?? meeshyKeyHintPlatform();
  const recipe = meeshyKeyHintRecipe({ context, size, surface, isPressed });
  const glyphs = meeshyKeyHintGlyphs(keys, resolved, { isRtl: isRightToLeft() });
  return (
    <span
      className="kit-key-hint"
      style={meeshyKeyHintStyle(recipe)}
      aria-hidden="true"
      data-kit-key-hint=""
      data-context={recipe.context}
      data-surface={recipe.surface}
      data-size={size ?? 'regular'}
      data-shortcut={meeshyKeyHintShortcut(keys, resolved)}
      {...(isPressed === true ? { 'data-pressed': '' } : {})}
    >
      {glyphs.map((glyph, index) => (
        <span key={`${glyph}-${index}`} className="kit-key" data-kit-key="" data-wide={glyph.length > 1 ? '' : undefined}>
          {glyph}
        </span>
      ))}
    </span>
  );
}

export type MeeshyKeyLegendItem = {
  readonly id: string;
  readonly combos: readonly MeeshyKeyCombo[];
  readonly title: string;
  readonly startsGroup?: boolean | undefined;
};

export type MeeshyKeyLegendProps = Environment & {
  readonly items: readonly MeeshyKeyLegendItem[];
  readonly container?: 'none' | 'glassBar' | undefined;
  readonly leading?: ReactNode;
};

/** Une légende de paires touche et libellé : filet seulement entre deux groupes, jamais en tête ; zéro entrée ne rend ni conteneur ni verre. */
export function MeeshyKeyLegend({ items, container = 'none', leading, platform, hasKeyboard, isEnabled }: MeeshyKeyLegendProps) {
  if (items.length === 0 || !isShown({ hasKeyboard, isEnabled })) return null;
  const recipe = meeshyKeyHintRecipe({ context: 'legend' });
  const body = (
    <div className="kit-key-legend" data-kit-key-legend="" style={meeshyKeyHintStyle(recipe)} role="group">
      {leading === undefined || leading === null ? null : <span className="kit-key-legend__leading">{leading}</span>}
      {items.map((item, index) => (
        <span key={item.id} className="kit-key-legend__entry">
          {item.startsGroup === true && index > 0 ? <span className="kit-key-legend__rule" aria-hidden="true" data-kit-key-rule="" /> : null}
          <span className="kit-key-legend__pair" data-kit-key-pair="">
            {item.combos.map((keys, at) => (
              <MeeshyKeyHint key={at} keys={keys} context="legend" platform={platform} hasKeyboard isEnabled />
            ))}
            <span className="kit-key-legend__label">{item.title}</span>
          </span>
        </span>
      ))}
    </div>
  );
  return container === 'glassBar' ? (
    <MeeshyGlass className="kit-key-legend-bar" tone="deep" style={meeshyKeyHintStyle(recipe)}>
      {body}
    </MeeshyGlass>
  ) : (
    body
  );
}
