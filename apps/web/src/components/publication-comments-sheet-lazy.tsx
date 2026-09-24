import { lazy, Suspense } from 'react';

import type { CommentsSheetHost } from '@/lib/view/use-comments-sheet-host';

/**
 * LE CHUNK À LA DEMANDE, EN UN SEUL POINT D'IMPORT (#6484) — `lazy(() =>
 * import(...))` est un APPEL STATIQUE : Rollup calcule, à CHAQUE site
 * d'appel, la liste PRÉCHARGÉE des chunks transitifs de sa cible
 * (`comment-thread` → liste, composeur, requête…) et l'inscrit dans LE CHUNK
 * QUI PORTE CET APPEL. Deux hôtes qui écrivaient chacun leur propre
 * `lazy(() => import('@/components/publication-comments-sheet')...)`
 * (`routes/story.tsx`, `routes/reels.tsx`) faisaient donc CHACUN payer cette
 * liste — mesurée à ~2 Ko gzip, la MÊME liste, deux fois : c'est elle qui a
 * fait passer le chunk `reels` au-dessus de son plafond de 7 Ko
 * (`measure-weight.mjs`) quand le lecteur des Réels a rejoint D-89.
 *
 * Un SEUL point d'import — ce module — porte l'appel une fois ; les DEUX
 * hôtes importent la référence PARESSEUSE qui en résulte, jamais l'appel
 * `lazy()` lui-même. Rollup ne place alors la liste préchargée que dans LE
 * chunk de CE module (partagé), et aucun des deux lecteurs ne la paie deux
 * fois.
 */
export const LazyPublicationCommentsSheet = lazy(() =>
  import('@/components/publication-comments-sheet').then((m) => ({ default: m.PublicationCommentsSheet })),
);

/**
 * LE MONTAGE, LUI AUSSI PARTAGÉ (#6484) — `routes/story.tsx` et
 * `routes/reels.tsx` posaient chacun le MÊME ternaire (`host.postId !== null
 * ? <Suspense><…Sheet/></Suspense> : null`) autour de leur propre alias de
 * `LazyPublicationCommentsSheet`. Un site UNIQUE, ici, à côté de l'appel
 * `lazy()` qu'il ferme.
 */
export function CommentsSheetPortal({ host }: { readonly host: CommentsSheetHost }) {
  return host.postId !== null ? (
    <Suspense fallback={null}>
      <LazyPublicationCommentsSheet postId={host.postId} onClose={host.close} />
    </Suspense>
  ) : null;
}
