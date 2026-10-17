/**
 * #10859 — L'ADRESSE D'UN LIEN D'E-MAIL QUI PORTE UN SECRET.
 *
 * Le secret (jeton, et l'adresse e-mail qui l'accompagne) voyage dans le
 * FRAGMENT : un navigateur ne l'envoie jamais au serveur, donc ni Traefik ni
 * nginx ne le journalisent, et il ne part pas dans un `Referer`. La page web le
 * lit, l'efface de la barre d'adresse et le remet à la passerelle dans le corps
 * d'un POST (`apps/web/src/lib/links/email-link-secret.ts`).
 *
 * La requête porte `via=email&token=` — un `token` VIDE, rien de secret. Le
 * service worker ne voit que `pathname + search` : `via=email` est le marqueur
 * que le service worker de cette version reconnaît, et le `token=` vide celui
 * d'un service worker d'AVANT #10859 encore actif dans un onglet, dont le motif
 * exige `token=` (#8053). Les deux font servir la page du RÉSEAU, jamais une
 * coquille précachée qui ne saurait pas lire le fragment. La page lit le
 * fragment d'abord ; la valeur vide de la requête ne compte pas.
 */
export const EMAIL_LINK_MARKER = { via: 'email', token: '' } as const;

/**
 * Les adresses que les applications DÉJÀ PUBLIÉES interceptent — iOS
 * (`apple-app-site-association` : `/auth/magic-link`, `/auth/verify-email`),
 * la coque Android et l'application Kotlin (`pathPrefix="/auth/magic-link"`,
 * `path="/auth/verify-email"`) — lisent le jeton dans la REQUÊTE : un lien à
 * fragment les ouvrirait sans rien valider. Les liens neufs visent donc des
 * ALIAS qu'aucune application publiée ne revendique ; la page web les ramène à
 * l'adresse canonique avant que le routeur ne les lise
 * (`apps/web/src/lib/links/email-link-secret.ts`). Les revendiquer côté app
 * attend une version minimale (#10861).
 */
export const EMAIL_LINK_PATHS = {
  magicLink: '/auth/email-link/magic-link',
  verifyEmail: '/auth/email-link/verify-email',
} as const;

export function emailSecretLink(options: {
  readonly base: string;
  readonly path: string;
  readonly secret: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
}): string {
  const query = new URLSearchParams({ ...options.query, ...EMAIL_LINK_MARKER });
  const fragment = new URLSearchParams(options.secret);
  return `${options.base.replace(/\/+$/, '')}${options.path}?${query.toString()}#${fragment.toString()}`;
}

/**
 * L'adresse de la PAGE qui explique la conséquence avant de l'appliquer.
 *
 * Les liens de courriel visaient auparavant des `GET` du gateway qui MUTAIENT
 * — un pré-chargeur de liens (antivirus de messagerie, Safe Links, prefetch du
 * navigateur) confirmait donc la suppression d'un compte sans qu'aucun humain
 * ne clique. Ils visent désormais une page : c'est le CLIC qui devient le
 * consentement, et la page fait le `POST` (#4183).
 */
export function buildDeletionPageUrl(action: 'confirm' | 'cancel' | 'purge', token: string): string {
  const base = process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://meeshy.me';
  return emailSecretLink({ base, path: '/account/deletion', secret: { token }, query: { action } });
}

/**
 * Le lien « ce n'était pas moi » de l'alerte de nouvelle connexion (#10859).
 * Il visait `GET /api/v1/auth/revoke-all-sessions?token=` sur la passerelle :
 * le jeton partait dans le journal d'accès, et un pré-chargeur de liens
 * déconnectait la victime sans qu'elle clique. Il vise désormais la page web,
 * qui le remet par `POST /auth/revoke-all-sessions` au clic.
 */
export function revokeAllSessionsPageUrl(token: string): string {
  const base = process.env.FRONTEND_URL || 'https://meeshy.me';
  return emailSecretLink({ base, path: '/auth/revoke-sessions', secret: { token } });
}
