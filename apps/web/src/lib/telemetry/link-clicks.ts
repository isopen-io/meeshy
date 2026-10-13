import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';

import { captureSurfaceOf } from './content-capture';
import { registrableDomain } from './registrable-domain';

/**
 * **LE CLIC D'UN LIEN DANS UN CONTENU** (#10505) — un écouteur DÉLÉGUÉ unique
 * sur le document : aucun composant ne se re-rend ni ne change d'adresse pour
 * être compté, et aucune URL n'est décorée (revue de conformité R3).
 *
 * - lien externe ⇒ `link/outbound_click`, le domaine enregistrable seul ;
 * - lien de suivi `/l/<jeton>` ⇒ `link/tracking_link_followed` et le domaine
 *   de l'adresse affichée — le clic, lui, est compté par la redirection ;
 * - hors écran de contenu (conversation, réglages), lien interne, IP : rien.
 */
type AnchorLike = {
  readonly href: string;
  readonly textContent?: string | null;
  closest(selector: string): { getAttribute(name: string): string | null } | null;
};

const TRACKING = /^\/l\/[A-Za-z0-9_-]{1,64}\/?$/;

/**
 * Le lien de suivi ne dit pas sa destination (`/l/<jeton>`) : son domaine se
 * lit sur l'adresse AFFICHÉE quand c'en est une. Un libellé (« le site ») ne
 * dit rien : aucun événement — la redirection compte le clic de toute façon.
 * Le jeton n'est jamais émis : ce n'est pas l'identifiant du lien.
 */
function domainOfShownText(text: string): string | null {
  const shown = text.trim();
  if (shown === '' || /\s/.test(shown)) return null;
  return registrableDomain(/^https?:\/\//i.test(shown) ? shown : `https://${shown}`);
}

export function linkEventOf(anchor: AnchorLike, context: { readonly ownOrigins: readonly string[]; readonly pathname: string }): SocialEventV2Input | null {
  const surface = captureSurfaceOf(context.pathname);
  if (surface === null) return null;
  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return null;
  }
  const postId = anchor.closest('[data-feed-card-id]')?.getAttribute('data-feed-card-id') ?? null;
  const parent = postId === null ? {} : { parent: { kind: 'post' as const, id: postId } };
  if (context.ownOrigins.includes(url.origin)) {
    if (!TRACKING.test(url.pathname)) return null;
    const shown = domainOfShownText(anchor.textContent ?? '');
    if (shown === null) return null;
    return { type: 'link', action: 'tracking_link_followed', target: { kind: 'link', id: shown, ...parent }, surface, domain: shown };
  }
  const domain = registrableDomain(url.href);
  if (domain === null) return null;
  return { type: 'link', action: 'outbound_click', target: { kind: 'link', id: domain, ...parent }, surface, domain };
}

/** L'écoute déléguée, posée une fois ; rend son retrait. */
export function bindLinkClicks(
  doc: Pick<Document, 'addEventListener' | 'removeEventListener'>,
  record: (event: SocialEventV2Input) => void,
  context: () => { readonly ownOrigins: readonly string[]; readonly pathname: string },
): () => void {
  const onClick = (event: Event): void => {
    const origin = event.target as { closest?: (selector: string) => AnchorLike | null } | null;
    const anchor = typeof origin?.closest === 'function' ? origin.closest('a[href]') : null;
    if (anchor === null) return;
    const recorded = linkEventOf(anchor, context());
    if (recorded !== null) record(recorded);
  };
  doc.addEventListener('click', onClick, { capture: true, passive: true });
  return () => doc.removeEventListener('click', onClick, { capture: true });
}
