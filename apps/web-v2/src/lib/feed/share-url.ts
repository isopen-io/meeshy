import type { ResultatInvitation } from '@/lib/view/invitation';

/**
 * L'ADRESSE QU'ON PARTAGE D'UNE PUBLICATION (#6278, D-48) — la forme
 * CANONIQUE que les deux autres clients reconnaissent déjà : le repli de
 * partage d'iOS (`FeedView.swift:22-29`), revendiquée en lien universel par
 * l'app (`DeepLinkRouter.swift:106`), servie par le legacy en production
 * (`apps/web/app/feeds/post/[postId]`).
 *
 * Pourquoi pas le lien SUIVI (`POST /posts/:id/share {generateLink:true}` →
 * `shortUrl`) qu'iOS demande d'abord : il faut l'ATTENDRE avant d'ouvrir la
 * feuille de partage, et le navigateur n'ouvre `navigator.share` que pendant
 * l'activation du geste — une requête réseau entre le tap et la feuille la
 * consomme (Safari rend `NotAllowedError`). Le lien part donc TOUT DE SUITE,
 * et le partage est COMPTÉ après coup (`recordPostShare`). L'attribution par
 * lien suivi reste à iOS ; l'écart est écrit dans D-48.
 */
const CANONICAL_ORIGIN = 'https://meeshy.me';

export function publicationShareUrl(postId: string): string {
  return `${CANONICAL_ORIGIN}/feeds/post/${encodeURIComponent(postId)}`;
}

/**
 * Ce que le lecteur DOIT s'entendre dire : rien quand la feuille du système a
 * déjà parlé (partagé ou annulé) ; un retour quand rien n'a bougé à l'écran.
 * `feed.share.error` (`Localizable.xcstrings`) pour l'échec. Une CLÉ DE
 * CATALOGUE (#6488), jamais un texte déjà traduit — cette couche n'a pas la
 * langue d'interface, seul l'hôte qui annonce (`usePostGesture`) l'a.
 *
 * UNE UNION LITTÉRALE, jamais `InterfaceCatalogKey` — voir le même
 * doc-comment sur `PostGestureMessageKey` (`lib/api/feed-gestures.ts`).
 */
type ShareOutcomeKey = 'feed.share.copied' | 'feed.share.error';

export const RETOUR_PARTAGE_PUBLICATION: Record<ResultatInvitation, ShareOutcomeKey | null> = {
  partage: null,
  annule: null,
  copie: 'feed.share.copied',
  indisponible: 'feed.share.error',
};
