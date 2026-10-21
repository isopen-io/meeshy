/**
 * #10877 — un `returnUrl` / `next` collé à la main peut viser une page à JETON
 * d'e-mail (lien magique, réinitialisation, vérification…) : après la session,
 * le navigateur y serait mené avec le jeton d'un AUTRE compte (fixation). La
 * règle est celle de `carriesEmailLinkSecret` (`@meeshy/shared`), lue sur
 * toutes les formes d'encodage qu'elle couvre, et ce qui est servi est la forme
 * NORMALISÉE — jamais l'entrée brute.
 */
export const SECRET_RETURN_PATHS: readonly string[] = [
  '/auth/magic-link?token=t',
  '/auth/magic-link/validate?token=t',
  '/auth/verify-email?token=t&email=a%40b.c',
  '/auth/verify-email/x',
  '/reset-password?token=t',
  '/auth/reset-password',
  '/auth/revoke-sessions?token=t',
  '/account/deletion?token=t',
  '/settings/verify-email-change?token=t',
  '/auth/email-link/magic-link#token=t',
  '/AUTH//Magic-Link/',
  '/auth%2Fmagic-link',
  '/auth%252Fmagic-link',
  '/%61uth/magic-link',
  '/x/../auth/magic-link',
  '/x/%2e%2e/auth/magic-link',
  '/x/%2E%2E/auth/magic-link',
  '/auth/./magic-link',
  '/auth/magic-link;jsessionid=1',
  '/auth/ma​gic-link',
  '/auth/magic-link/',
  '/#/auth/magic-link?token=t',
  '/login?next=%2Fauth%2Fmagic-link%3Ftoken%3Dt',
  '/login?next=/reset-password?token=t',
  '/signup?next=%252Fauth%252Fverify-email',
  '/login?next=%2Flogin%3Fnext%3D%252Fauth%252Fmagic-link',
  '/auth/magic-link/validate?returnUrl=/auth/revoke-sessions',
  '/c/x#next=/auth/magic-link',
  '/login?next=https%3A%2F%2Fmeeshy.me%2Fauth%2Fmagic-link',
  `${'/login?next='.repeat(4)}/auth/magic-link?token=t`,
  `${'/login?next='.repeat(7)}/auth/magic-link?token=t`,
  `/login?next=${Array.from({ length: 8 }).reduce<string>((value) => encodeURIComponent(value), '/auth/magic-link')}`,
];
