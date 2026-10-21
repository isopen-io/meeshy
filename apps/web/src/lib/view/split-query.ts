/**
 * QUI A DROIT AU CADRE CÔTE À CÔTE, ET QUAND (#10073, D-185 ; #10086).
 *
 * La règle vit ici, hors du cadre lui-même : la table des routes la lit pour
 * décider de CHARGER le cadre (`route-table.tsx`, import différé), le cadre la
 * relit pour se DESSINER (`routes/split-frame.tsx`). Un téléphone ne
 * télécharge donc que ces quelques lignes, jamais le cadre.
 *
 * Le seuil est OBSERVÉ hors React (`matchMedia`, un abonnement par lecteur),
 * jamais mesuré à chaque rendu : franchir 1024 px bascule la vue sans
 * rechargement, et aucun écouteur `resize` ne tourne.
 */
export const SPLIT_QUERY = '(min-width: 1024px)';

export type SplitPane = 'empty' | 'thread';

export function splitPaneOf({
  routeKey,
  wide,
  guest,
}: {
  readonly routeKey: string;
  readonly wide: boolean;
  readonly guest: boolean;
}): SplitPane | null {
  if (!wide || guest) return null;
  if (routeKey === 'list') return 'empty';
  if (routeKey === 'thread') return 'thread';
  return null;
}

function wideMedia(): MediaQueryList | null {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? null : window.matchMedia(SPLIT_QUERY);
}

export function subscribeWide(onChange: () => void): () => void {
  const media = wideMedia();
  if (media === null) return () => {};
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export const isWide = (): boolean => wideMedia()?.matches ?? false;
