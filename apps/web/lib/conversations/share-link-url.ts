/**
 * L'URL canonique d'un lien de partage — source unique.
 *
 * `/chat/:linkId` ouvre la conversation dans la vue courante et pose la modale
 * de jonction par-dessus si besoin. `/join/:linkId` était l'ancienne page
 * d'accueil séparée ; elle est redirigée en 308 (`next.config.ts`), mais plus
 * aucun code ne doit FABRIQUER cette forme : un lien collé dans WhatsApp doit
 * atterrir directement, sans détour de redirection.
 *
 * Sept endroits construisaient cette URL à la main. Ils passent tous ici.
 */
export function buildShareLinkPath(linkId: string): string {
  return `/chat/${linkId}`;
}

export function buildShareLinkUrl(linkId: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me');

  return `${base.replace(/\/+$/, '')}${buildShareLinkPath(linkId)}`;
}
