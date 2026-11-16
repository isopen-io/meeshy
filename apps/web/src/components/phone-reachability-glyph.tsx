/**
 * **LE DESSIN D'UN TÉLÉPHONE, BARRÉ QUAND IL EST INJOIGNABLE** (#18737, TEL-01) — le pendant web d'`iphone.slash`
 * (iOS) et de `PhonelinkOff` (Android). Pur, sans hook : `Avatar` est appelé comme une fonction par des témoins qui
 * rejouent l'arbre sans dispatcher. Toujours `aria-hidden` : l'hôte dit l'état avec des mots.
 */

/** Sous cette taille d'avatar, le glyphe ne se lirait plus : il ne se pose pas, l'avatar le DIT quand même. */
export const AVATAR_PHONE_MIN_SIZE = 24;

export function PhoneReachabilityGlyph({ reachable, size = 16, ink = 'currentColor' }: { readonly reachable: boolean; readonly size?: number; readonly ink?: string }) {
  return (
    <svg data-phone-glyph={reachable ? 'reachable' : 'unreachable'} aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
      <rect x="4" y="1.25" width="8" height="13.5" rx="2" stroke={ink} strokeWidth="1.4" />
      <path d="M7 12.4h2" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
      {reachable ? null : <path d="M2 2.5 14 13.5" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

/**
 * **LE TÉLÉPHONE INJOIGNABLE SUR L'AVATAR** (#18737) — à la place de l'icône batterie, en haut côté fin de ligne :
 * quand les deux sont servis, l'injoignable l'emporte (un téléphone qui ne répond plus en dit plus que sa batterie).
 * Caché tant que le téléphone répond (l'hôte ne le pose que si un état est servi).
 */
export function AvatarPhoneUnreachableBadge({ size }: { readonly size: number }) {
  if (size < AVATAR_PHONE_MIN_SIZE) return null;
  const glyph = Math.max(12, Math.round(size * 0.3));
  return (
    <span
      data-avatar-phone-unreachable=""
      aria-hidden="true"
      className="pointer-events-none absolute grid place-items-center rounded-chip"
      style={{
        top: -Math.round(size * 0.04),
        insetInlineEnd: -Math.round(size * 0.1),
        padding: 2,
        background: 'var(--color-ios-surface)',
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)',
        color: 'var(--color-error)',
      }}
    >
      <PhoneReachabilityGlyph reachable={false} size={glyph} />
    </span>
  );
}
