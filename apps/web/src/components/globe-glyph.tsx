/**
 * LE GLOBE DE WORLD WIDE — le tracé de la planche (landing, connexion, entrée
 * invité), en `currentColor` : l'hôte en choisit l'encre (#10007).
 */
export function GlobeGlyph({ size, strokeWidth = 1.8 }: { readonly size: number; readonly strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}
