/**
 * **LE DESSIN DE LA VÉRIFICATION D'INACTIVITÉ** (#18738, TEL-02) — un sablier quand la personne n'a pas répondu à
 * « Tout va bien ? », une coche cerclée quand elle va bien : le pendant web d'`hourglass` et de
 * `checkmark.circle` (iOS). Pur, sans hook ; toujours `aria-hidden` : l'hôte dit l'état avec des mots.
 */
export function InactivityGlyph({ responded, size = 16, ink = 'currentColor' }: { readonly responded: boolean; readonly size?: number; readonly ink?: string }) {
  return (
    <svg data-inactivity-glyph={responded ? 'responded' : 'alert'} aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
      {responded ? (
        <>
          <circle cx="8" cy="8" r="6.3" stroke={ink} strokeWidth="1.4" />
          <path d="m5.2 8.2 1.9 1.9 3.7-4" stroke={ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M4 1.75h8M4 14.25h8" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M5 1.75v2.1c0 1.2 1.2 2.4 3 4.15 1.8-1.75 3-2.95 3-4.15v-2.1M5 14.25v-2.1C5 10.95 6.2 9.75 8 8c1.8 1.75 3 2.95 3 4.15v2.1" stroke={ink} strokeWidth="1.3" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
