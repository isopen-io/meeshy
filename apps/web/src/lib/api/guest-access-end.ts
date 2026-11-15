import type { SessionStoreApi } from './session';

/**
 * **L'ACCÈS D'UN INVITÉ PREND FIN** (#10442) — la passerelle dit « c'est fini »
 * de deux façons à une session de lien (`X-Session-Token`), et aucune n'est un
 * 401 qu'un rafraîchissement lèverait :
 *
 * - le lien a expiré : 403 `code: SHARE_LINK_EXPIRED` sur toute requête REST
 *   (`middleware/auth.ts`, #10437), et `error { code: SHARE_LINK_EXPIRED }` puis
 *   coupure sur la socket (`AuthHandler._refuseExpiredGuestLink`) ;
 * - l'invité a été retiré : 410 `error: GUEST_ACCESS_REVOKED` sur toute requête
 *   REST (le motif est dans `error`, la passerelle ne pose pas de `code`), et
 *   `error { code: GUEST_ACCESS_REVOKED }` puis coupure sur la socket
 *   (`guestLinkWatch.refuseRevokedGuest`, #10443, #10448).
 *
 * L'appareil oublie alors la session de l'invité, et le ramène à la page de
 * son lien, qui dit pourquoi (`?ended=`) et offre les sorties.
 */
export type GuestAccessEnd = 'expired' | 'revoked';

export const GUEST_ACCESS_ENDS: readonly GuestAccessEnd[] = ['expired', 'revoked'];

const SHARE_LINK_EXPIRED = 'SHARE_LINK_EXPIRED';
const GUEST_ACCESS_REVOKED = 'GUEST_ACCESS_REVOKED';

export function guestAccessEndOf(failure: { readonly status: number; readonly code?: string; readonly error?: string }): GuestAccessEnd | null {
  if (failure.status === 403 && failure.code === SHARE_LINK_EXPIRED) return 'expired';
  if (failure.status === 410 && (failure.error === GUEST_ACCESS_REVOKED || failure.code === GUEST_ACCESS_REVOKED)) return 'revoked';
  return null;
}

export function guestAccessEndOfSocketError(payload: unknown): GuestAccessEnd | null {
  if (payload === null || typeof payload !== 'object') return null;
  const code = (payload as { readonly code?: unknown }).code;
  if (code === SHARE_LINK_EXPIRED) return 'expired';
  if (code === GUEST_ACCESS_REVOKED) return 'revoked';
  return null;
}

export function guestAccessEndedOf(raw: string | null): GuestAccessEnd | null {
  return GUEST_ACCESS_ENDS.find((end) => end === raw) ?? null;
}

export function guestAccessEndedPath(link: string, end: GuestAccessEnd): string {
  return `/chat/${encodeURIComponent(link)}?ended=${end}`;
}

/**
 * Le geste UNIQUE, partagé par le transport REST et la socket. Il ne touche
 * qu'une session d'INVITÉ : sous un compte qui tenait cette identité anonyme
 * (#8816), `end` (`endRevokedSession`) oublie l'invité et rend le compte.
 */
export function endGuestAccess(deps: {
  readonly reason: GuestAccessEnd;
  readonly store: SessionStoreApi;
  readonly end: (store: SessionStoreApi) => void;
  readonly navigate: (url: string, replace: boolean) => void;
}): void {
  const session = deps.store.getState().session;
  if (session.status !== 'guest') return;
  const link = session.guest.link;
  deps.end(deps.store);
  deps.navigate(link === '' ? '/' : guestAccessEndedPath(link, deps.reason), true);
}
