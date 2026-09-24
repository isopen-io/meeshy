import type { ReactNode } from 'react';

import { Glyph, GlyphSvg, type GlyphShape } from './glyph';
import type { GlyphName } from './glyphs';
import { InfoHintButton, InfoHintText, useInfoHint, type InfoHint } from './info-hint';

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
  valid = false,
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
  /**
   * LE CHAMP EST BON, ET ÇA SE VOIT (#6582, directive porteur 2026-09-14 :
   * « si le mot de passe est entré et est OK, entourer le champ en vert
   * directement »).
   *
   * La teinte est `var(--color-success)` — le jeton de la table PARTAGÉE, qui
   * porte déjà une valeur par schéma (`#10b981` en sombre, `#047857` en clair,
   * `packages/design-tokens/{dark,light}.css`). Aucune couleur n'est
   * fabriquée ici, et aucune variante `light:` n'est nécessaire : c'est
   * exactement le mécanisme qu'`app.css` décrit en tête (« une couleur juste
   * l'est dans les deux schémas, par construction »). Mesuré sur la carte :
   * 7,3:1 en sombre, 5,3:1 en clair.
   *
   * Le signal ne tient PAS à la seule couleur (règle 17) : le bord épaissit
   * aussi (1px → 2px, comme au focus), et l'appelant dit en toutes lettres ce
   * que le vert lui a appris. `data-field-state` le rend mesurable sans
   * interroger une chaîne de style.
   *
   * Un refus GAGNE toujours : un champ ne peut pas être bon et refusé.
   */
  valid?: boolean | undefined;
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
   * Le bouton et la note sont ceux de `info-hint.tsx` (#6626), que les écrans
   * posent aussi HORS d'un champ ; le texte reste porté par `aria-describedby`
   * du champ même REPLIÉ — un lecteur d'écran l'entend donc sans avoir à
   * trouver le bouton.
   */
  hint?: InfoHint | undefined;
  /** L'`<input>`/`<select>` lui-même — reçoit `id` et `aria-describedby` pour
   * que le refus SOUS le champ soit lu par un lecteur d'écran comme le champ
   * lui-même, jamais un texte à part. */
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}) {
  const errorId = `${id}-error`;
  const hintState = useInfoHint();
  const iconStyle = { color: `color-mix(in srgb, ${tint} 70%, transparent)`, flexShrink: 0 };
  const isValid = valid && error === undefined;
  const isEmphasized = focused || isValid;
  return (
    <div className="grid gap-1">
      {label !== undefined ? (
        <label htmlFor={id} className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
          {label}
        </label>
      ) : null}
      <div
        className="field-box flex items-center gap-3 rounded-[14px] px-4 transition-colors"
        data-field-state={isValid ? 'valid' : undefined}
        style={{
          minHeight: 48,
          backgroundColor: 'var(--color-ios-card)',
          /* Le focus est un COUPLE teinte + FORME (#5894, corollaire de la
             règle 17) : la boîte double aussi l'épaisseur de son bord
             (1px → 2px), jamais la seule teinte — sans quoi le signal ne
             tient pas sur un fond dont le contraste de couleur est faible.
             `box-sizing: border-box` (préflight Tailwind) absorbe le pixel
             de plus DANS la boîte : ni ses voisins ni sa hauteur ne bougent. */
          border: `${isEmphasized ? '2px' : '1px'} solid ${
            isValid
              ? 'var(--color-success)'
              : focused
                ? `color-mix(in srgb, ${tint} 60%, transparent)`
                : 'color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)'
          }`,
        }}
      >
        {icon !== undefined ? <Glyph name={icon} size={20} style={iconStyle} /> : null}
        {icon === undefined && glyph !== undefined ? <GlyphSvg glyph={glyph} size={20} style={iconStyle} /> : null}
        {children({
          id,
          describedBy: [error !== undefined ? errorId : undefined, hint !== undefined ? hintState.id : undefined]
            .filter((part): part is string => part !== undefined)
            .join(' ') || undefined,
        })}
        {hint !== undefined ? <InfoHintButton hint={hint} state={hintState} style={{ marginRight: -10 }} /> : null}
      </div>
      {hint !== undefined ? <InfoHintText hint={hint} state={hintState} /> : null}
      {error !== undefined ? (
        <p id={errorId} role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
