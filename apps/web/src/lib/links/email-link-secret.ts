/**
 * LE SECRET D'UN LIEN D'E-MAIL QUITTE LA BARRE D'ADRESSE DÈS L'OUVERTURE (#10859).
 *
 * La passerelle compose `…/reset-password?via=email#token=…`
 * (`services/gateway/src/utils/email-secret-link.ts`) : le FRAGMENT n'est
 * jamais envoyé au serveur, donc ni Traefik ni nginx ne journalisent le jeton,
 * et il ne part dans aucun `Referer`. Cette page le lit, l'efface de l'adresse
 * (`history.replaceState`) et le range dans l'ENTRÉE d'historique : un
 * rechargement le retrouve, une navigation vers une autre page non. L'écran le
 * remet ensuite à la passerelle dans le CORPS d'un POST.
 *
 * Rétrocompatibilité (#9223) : les e-mails partis avant portent `?token=` dans
 * la requête. Lus de la même façon, puis effacés de l'adresse — le serveur les a
 * déjà vus, mais l'historique et le `Referer` ne les gardent plus.
 *
 * Les liens magiques et de vérification visent des ALIAS
 * (`/auth/email-link/magic-link`, `/auth/email-link/verify-email`) : les
 * applications déjà publiées interceptent les adresses canoniques et n'y lisent
 * que la requête. La page ramène l'alias à l'adresse canonique, dans la même
 * entrée d'historique — le reste de l'application ne connaît que celle-ci.
 *
 * Ce module n'importe PAS le routeur : `main.tsx` l'appelle avant que le routeur
 * ne lise l'adresse, pour que le premier rendu parte de l'adresse nettoyée.
 */

export const EMAIL_LINK_ALIASES: Readonly<Record<string, string>> = {
  '/auth/email-link/magic-link': '/auth/magic-link',
  '/auth/email-link/verify-email': '/auth/verify-email',
};

export const EMAIL_LINK_PATHS: ReadonlySet<string> = new Set([
  '/auth/verify-email',
  '/auth/magic-link',
  '/auth/magic-link/validate',
  '/auth/revoke-sessions',
  '/reset-password',
  '/account/deletion',
  '/settings/verify-email-change',
]);

const LIFTED_KEYS = ['token', 'email'] as const;
const MARKER_KEY = 'via';
const STATE_KEY = 'meeshyEmailLinkSecret';

export type EmailLinkSecret = Readonly<Partial<Record<(typeof LIFTED_KEYS)[number], string>>>;

export type EmailLinkWindow = {
  readonly location: { readonly pathname: string; readonly search: string; readonly hash: string };
  readonly history: { readonly state: unknown; replaceState(data: unknown, unused: string, url: string): void };
};

type Stored = { readonly path: string; readonly secret: EmailLinkSecret };

const pathOf = (pathname: string): string => pathname.replace(/\/+$/, '') || '/';

const objectOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

export function liftEmailLinkSecret(win: EmailLinkWindow): void {
  const arrived = pathOf(win.location.pathname);
  const path = EMAIL_LINK_ALIASES[arrived] ?? arrived;
  if (!EMAIL_LINK_PATHS.has(path)) return;
  const fragment = new URLSearchParams(win.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(win.location.search);
  const read = (key: string): string | null => fragment.get(key) || query.get(key) || null;
  if (read('token') === null) {
    if (path !== arrived) win.history.replaceState(win.history.state, '', `${path}${win.location.search}`);
    return;
  }

  const secret: EmailLinkSecret = Object.fromEntries(
    LIFTED_KEYS.flatMap((key) => {
      const value = read(key);
      return value === null ? [] : [[key, value]];
    }),
  );
  [...LIFTED_KEYS, MARKER_KEY].forEach((key) => query.delete(key));
  const rest = query.toString();
  const stored: Stored = { path, secret };
  win.history.replaceState({ ...objectOf(win.history.state), [STATE_KEY]: stored }, '', `${path === arrived ? win.location.pathname : path}${rest ? `?${rest}` : ''}`);
}

export function emailLinkSecret(win: EmailLinkWindow): EmailLinkSecret {
  const stored = objectOf(win.history.state)[STATE_KEY] as Stored | undefined;
  return stored !== undefined && stored.path === pathOf(win.location.pathname) ? stored.secret : {};
}

/**
 * UN JETON SERVI NE RESTE PAS DANS L'HISTORIQUE (#10864) — l'écran l'appelle
 * dès que le lien a été utilisé avec succès ou refusé pour de bon : l'entrée
 * d'historique perd le secret, garde son adresse et le reste de son état. Un
 * retour arrière ou un rechargement ne le relit plus. Une issue PASSAGÈRE (hors
 * ligne, passerelle injoignable) ne l'appelle pas : réessayer en a besoin.
 */
export function forgetEmailLinkSecret(win: EmailLinkWindow | undefined = typeof window === 'undefined' ? undefined : window): void {
  if (win === undefined) return;
  const state = objectOf(win.history.state);
  if (!(STATE_KEY in state)) return;
  const kept = Object.fromEntries(Object.entries(state).filter(([key]) => key !== STATE_KEY));
  win.history.replaceState(kept, '', `${win.location.pathname}${win.location.search}${win.location.hash}`);
}
