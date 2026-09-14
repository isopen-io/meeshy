import { useId, useState, type ReactNode } from 'react';

import { Glyph, GlyphSvg, type GlyphShape } from './glyph';
import type { GlyphName } from './glyphs';

/**
 * LE BLOC DE CHAMP (#5555, E7) — que les 40+ écrans restants copieront.
 *
 * Miroir de la composition répétée dans `LoginView.swift`/`SignupView.swift` :
 * icône violette à 70 % à gauche, surface `theme.inputBackground`, coin
 * `MeeshyRadius.md` (14 px), bord `inputBorder` à 30 % — teinté à 60 % ET
 * épaissi (1px → 2px, #5894) quand focus : la règle 17 interdit qu'un signal
 * ne tienne qu'à une couleur, y compris ici où l'anneau lui-même est exclu
 * (#5816). Le refus se pose SOUS le champ, en `role="alert"`.
 *
 * PRIMITIVES EN PROPS, AUCUN MAGASIN GLOBAL (Zero Unnecessary Re-render) :
 * `focused` est un booléen que l'écran porte lui-même (`useState`) — ce
 * composant ne s'abonne à rien.
 */
export function Field({
  id,
  label,
  icon,
  glyph,
  tint,
  focused,
  error,
  hint,
  children,
}: {
  id: string;
  label?: string | undefined;
  icon?: GlyphName | undefined;
  /**
   * Un tracé du SOCLE porté par sa FORME plutôt que par son nom — alternative
   * à `icon` pour un jeu d'écran (#5816, `AUTH_GLYPHS.envelope` : le champ
   * e-mail du lien magique et du mot de passe oublié). Même dispositif que
   * `axisGlyph` (`routes/progression.tsx:72-74`) : `Field` reste agnostique
   * du jeu qui a produit le tracé. `icon` et `glyph` ne se posent jamais
   * ensemble — au plus l'un des deux.
   */
  glyph?: GlyphShape | undefined;
  /** La couleur du bord au focus — `var(--ios-purple-600)` (connexion) ou
   * `var(--ios-indigo-500)` (inscription) : DEUX écrans, deux teintes,
   * jamais une troisième source de vérité pour le focus. */
  tint: string;
  focused: boolean;
  error?: string | undefined;
  /**
   * LE DÉTAIL DERRIÈRE UN (i) (#6441, retour porteur « la page est trop
   * surchargée »).
   *
   * Trois notes posées SOUS trois champs remplissaient l'écran d'un texte que
   * personne ne relit après la première fois. Le bouton vit DANS le cadre du
   * champ, à droite : la rangée fait déjà 48 px, donc le détail ne coûte plus
   * aucune hauteur tant qu'on ne le demande pas.
   *
   * Le tracé vient de l'APPELANT, jamais d'un import ici — `Field` est au
   * socle, et le jeu d'écran qui porte `info` ne doit pas y entrer (§ le
   * doc-comment de `glyph` ci-dessus, et `extract-glyphs.mjs`).
   *
   * `aria-expanded` + `aria-controls` disent l'état ; le texte reste porté par
   * `aria-describedby` du champ même REPLIÉ — un lecteur d'écran l'entend donc
   * sans avoir à trouver le bouton.
   */
  hint?: { text: string; glyph: GlyphShape; label: string } | undefined;
  /** L'`<input>`/`<select>` lui-même — reçoit `id` et `aria-describedby` pour
   * que le refus SOUS le champ soit lu par un lecteur d'écran comme le champ
   * lui-même, jamais un texte à part. */
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}) {
  const errorId = `${id}-error`;
  const hintId = useId();
  const [isHintOpen, setHintOpen] = useState(false);
  const iconStyle = { color: `color-mix(in srgb, ${tint} 70%, transparent)`, flexShrink: 0 };
  return (
    <div className="grid gap-1">
      {label !== undefined ? (
        <label htmlFor={id} className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
          {label}
        </label>
      ) : null}
      <div
        className="field-box flex items-center gap-3 rounded-[14px] px-4 transition-colors"
        style={{
          minHeight: 48,
          backgroundColor: 'var(--color-ios-card)',
          /* Le focus est un COUPLE teinte + FORME (#5894, corollaire de la
             règle 17) : la boîte double aussi l'épaisseur de son bord
             (1px → 2px), jamais la seule teinte — sans quoi le signal ne
             tient pas sur un fond dont le contraste de couleur est faible.
             `box-sizing: border-box` (préflight Tailwind) absorbe le pixel
             de plus DANS la boîte : ni ses voisins ni sa hauteur ne bougent. */
          border: `${focused ? '2px' : '1px'} solid ${
            focused ? `color-mix(in srgb, ${tint} 60%, transparent)` : 'color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)'
          }`,
        }}
      >
        {icon !== undefined ? <Glyph name={icon} size={20} style={iconStyle} /> : null}
        {icon === undefined && glyph !== undefined ? <GlyphSvg glyph={glyph} size={20} style={iconStyle} /> : null}
        {children({
          id,
          describedBy: [error !== undefined ? errorId : undefined, hint !== undefined ? hintId : undefined]
            .filter((part): part is string => part !== undefined)
            .join(' ') || undefined,
        })}
        {hint !== undefined ? (
          <button
            type="button"
            onClick={() => setHintOpen((open) => !open)}
            aria-expanded={isHintOpen}
            aria-controls={hintId}
            aria-label={hint.label}
            className="grid shrink-0 place-items-center rounded-full"
            style={{ minWidth: 44, minHeight: 44, marginRight: -10, color: 'var(--color-ios-ink-3)' }}
          >
            <GlyphSvg glyph={hint.glyph} size={18} />
          </button>
        ) : null}
      </div>
      {hint !== undefined ? (
        <p
          id={hintId}
          className={`text-caption ${isHintOpen ? '' : 'sr-only'}`}
          style={{ color: 'var(--color-ios-ink-2)' }}
        >
          {hint.text}
        </p>
      ) : null}
      {error !== undefined ? (
        <p id={errorId} role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
