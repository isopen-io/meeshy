/**
 * **LE DESSIN DE LA CHUTE DÉTECTÉE** (#18748, SAN-01) — une silhouette qui bascule quand une chute est détectée, une
 * coche cerclée quand la personne a répondu « Je vais bien » : le pendant web de `figure.fall` et de
 * `checkmark.circle` (iOS). Pur, sans hook ; toujours `aria-hidden` : l'hôte dit l'état avec des mots.
 */
export function FallGlyph({ responded, size = 16, ink = 'currentColor' }: { readonly responded: boolean; readonly size?: number; readonly ink?: string }) {
  return (
    <svg data-fall-glyph={responded ? 'responded' : 'detected'} aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
      {responded ? (
        <>
          <circle cx="8" cy="8" r="6.3" stroke={ink} strokeWidth="1.4" />
          <path d="m5.2 8.2 1.9 1.9 3.7-4" stroke={ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="11.6" cy="3.4" r="1.6" fill={ink} />
          <path d="M10.2 5.6 6.4 7.8l-2.6-.9M6.4 7.8l1.2 3.4-3 1.8M7.6 11.2l4.1.6" stroke={ink} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1.75 14.25h12.5" stroke={ink} strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
