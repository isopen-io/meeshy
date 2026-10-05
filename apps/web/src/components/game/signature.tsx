import { SIGNATURE_BOX, SIGNATURE_DASHES, signatureLayers, type SignatureMode } from '@/lib/game/signature';

/**
 * LA SIGNATURE (#9380) — les trois traits de Meeshy, sur tout objet du jeu.
 * Géométrie : `lib/brand.ts` (500 · 400 · 300 dans 1 024, jamais déformée).
 * Matière : voir `lib/game/signature.ts` (aplat, frappée, gravée).
 *
 * DÉCORATIF. Le dessin est `aria-hidden` ; le texte accessible est porté par
 * l'hôte (la pièce dit « Meesh n° 13 », le rang dit son nom).
 *
 * Les traits de la couche d'encre portent `data-game-dash="0|1|2"` : c'est ce
 * que la chorégraphie du rang vise pour GRAVER la Signature trait par trait.
 */

const DEFAULT_STROKE = 92;

type GlyphProps = {
  /** Centre de la Signature dans le repère du SVG hôte. */
  readonly cx: number;
  readonly cy: number;
  /** Côté du carré de 1 024, dans le repère de l'hôte. */
  readonly size: number;
  /** Une couleur CSS : `currentColor`, un jeton `var(--game-…-ink)`. */
  readonly color?: string;
  readonly mode?: SignatureMode;
  /** Épaisseur du trait dans le repère 1024 (92 par défaut ; 96–120 sur les petits objets). */
  readonly strokeWidth?: number;
};

export function SignatureGlyph({ cx, cy, size, color = 'currentColor', mode = 'flat', strokeWidth = DEFAULT_STROKE }: GlyphProps) {
  const scale = size / SIGNATURE_BOX;
  return (
    <g data-game-signature={mode}>
      {signatureLayers({ mode, size, color }).map((layer) => (
        <g key={layer.tone} transform={`translate(${cx - size / 2 + layer.dx} ${cy - size / 2 + layer.dy}) scale(${scale})`}>
          {SIGNATURE_DASHES.map((dash, i) => (
            <line
              key={dash.y}
              x1={dash.x1}
              y1={dash.y}
              x2={dash.x2}
              y2={dash.y}
              stroke={layer.color}
              strokeOpacity={layer.opacity ?? dash.opacity}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              {...(layer.tone === 'ink' ? { 'data-game-dash': i } : {})}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

type Props = Omit<GlyphProps, 'cx' | 'cy'>;

export function Signature({ size, color = 'currentColor', mode = 'flat', strokeWidth = DEFAULT_STROKE }: Props) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${SIGNATURE_BOX} ${SIGNATURE_BOX}`} fill="none" aria-hidden="true" focusable="false">
      <SignatureGlyph cx={SIGNATURE_BOX / 2} cy={SIGNATURE_BOX / 2} size={SIGNATURE_BOX} color={color} mode={mode} strokeWidth={strokeWidth} />
    </svg>
  );
}
