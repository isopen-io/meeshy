import { SignatureGlyph } from './signature';

/**
 * LE TAMPON D'UNE LANGUE (#9388, conception II.8) — un cachet rond à deux
 * cercles, le code de la langue en grandes lettres, la Signature Meeshy
 * dessous (en aplat : le tampon est une encre, pas un métal). Légèrement penché,
 * un cran à gauche ou à droite selon la langue : un passeport tamponné à la main.
 *
 * `code: null` dessine la place d'un tampon À DÉCOUVRIR : un cercle en pointillé,
 * sans lettre. La couleur d'une langue est stable (`stampTone`) : un jeton
 * `--game-stamp-<0..5>`, jamais un littéral.
 *
 * DÉCORATIF (`aria-hidden`) : l'hôte nomme la langue en toutes lettres.
 */
const TONES = 6;

const hash = (code: string): number => [...code].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9973, 7);

export const stampTone = (code: string): string => `var(--game-stamp-${hash(code.toLowerCase()) % TONES})`;

const letters = (code: string): string => code.slice(0, 2).toLocaleUpperCase('en');

export function AtlasStamp({ code, size }: { readonly code: string | null; readonly size: number }) {
  const empty = code === null;
  const tone = empty ? 'var(--game-ash)' : stampTone(code);
  const tilt = empty ? 0 : hash(code) % 2 === 0 ? -6 : 8;
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} aria-hidden="true" focusable="false" data-game-stamp={empty ? 'empty' : code}>
      <g transform={`rotate(${tilt} 36 36)`}>
        <circle cx="36" cy="36" r="29" fill="none" stroke={tone} strokeWidth="2.5" {...(empty ? { strokeDasharray: '4 4' } : {})} />
        <circle cx="36" cy="36" r="23" fill="none" stroke={tone} strokeWidth="1" {...(empty ? { strokeDasharray: '2 4' } : {})} />
        {empty ? null : (
          <>
            <text x="36" y="38" textAnchor="middle" fontFamily="var(--font-native)" fontWeight="800" fontSize="15" fill={tone}>
              {letters(code)}
            </text>
            <SignatureGlyph cx={36} cy={48} size={14} color={tone} mode="flat" strokeWidth={120} />
          </>
        )}
      </g>
    </svg>
  );
}
