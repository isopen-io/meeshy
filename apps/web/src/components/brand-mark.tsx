/**
 * LA MARQUE MEESHY — les TROIS TRAITS, portés de `MeeshyDashesShape`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/AnimatedLogoView.swift:12-34`).
 *
 * POURQUOI PAS `/brand/logo.png` (revue de #5555, défaut 1). Ce fichier est
 * l'ICÔNE D'APPLICATION — le carré indigo plein, avec ses traits BLANCS
 * gravés dedans. Ce n'est PAS ce que `LoginView.swift:96-103` montre : là,
 * `AnimatedLogoView` dessine les traits SEULS, teintés `isDark ? .white :
 * MeeshyColors.indigo950`, sans conteneur ni fond. Servir l'icône sur cet
 * écran posait un carré à angles vifs au-dessus du titre dans les DEUX
 * schémas, là où la cible iOS ne montre que trois traits — une divergence de
 * structure (D-1) sur le premier écran que voit un visiteur.
 *
 * LA COULEUR NE S'ÉCRIT PAS ICI : `currentColor`. Le consommateur pose
 * `color: var(--color-ios-ink)`, dont la table DÉRIVÉE (D-4) vaut `#eef2ff`
 * en sombre et `#1e1b4b` en clair (`packages/design-tokens/ios.css:53,114`) —
 * soit EXACTEMENT `isDark ? .white : indigo950`. Un jeton, deux schémas, zéro
 * variante `light:`.
 *
 * LES TROIS OPACITÉS SONT CELLES DE L'ÉTAT AU REPOS (`continuous: false`,
 * `breathe == false`) : 0,7 · 1,0 · 0,75 — c'est le trait du MILIEU qui est
 * le plus dense, et c'est ce que montre la capture cible.
 *
 * CE QUI N'EST PAS REPRIS, et pourquoi : le tracé animé (`trim` 0→1 en 0,25 s,
 * décalé de 0,1 s par trait) et la respiration continue. Ils ne changent pas
 * l'état au repos — le seul que compare une capture — et le dépôt coupe toute
 * animation sous `prefers-reduced-motion` : un tracé qui ne joue que pour la
 * moitié des lecteurs n'est pas une différence de structure, c'est un ornement.
 */

/** Les trois segments, dans le repère 1024 de `MeeshyDashesShape.path(in:)`. */
const DASHES = [
  { y: 384, x2: 762, opacity: 0.7 },
  { y: 512, x2: 662, opacity: 1 },
  { y: 640, x2: 562, opacity: 0.75 },
] as const;

const ORIGIN_X = 262;
const BOX = 1024;

export function BrandMark({
  size,
  /** L'épaisseur du trait EN POINTS de la vue, comme `AnimatedLogoView(lineWidth:)` :
   * 10 sur l'écran de connexion (`LoginView.swift:99`). La conversion vers le
   * repère 1024 se fait ici, pour qu'aucun appelant n'ait à la refaire. */
  lineWidth,
}: {
  size: number;
  lineWidth: number;
}) {
  const strokeWidth = (lineWidth * BOX) / size;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {DASHES.map((dash) => (
        <line
          key={dash.y}
          x1={ORIGIN_X}
          y1={dash.y}
          x2={dash.x2}
          y2={dash.y}
          stroke="currentColor"
          strokeOpacity={dash.opacity}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
