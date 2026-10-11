import { Suspense, lazy, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { sessionStore } from '@/lib/api/session';
import type { FrameProps } from '@/lib/router';
import { ScrollportKeyScope } from '@/lib/view/use-scrollport-memory';

/**
 * SUR GRAND ÉCRAN, LA LISTE ET LE FIL CÔTE À CÔTE (#10073, D-185).
 *
 * `/chats` et `/c/:id` restent DEUX adresses et deux écrans découpés
 * (`route-table.tsx`) ; à partir de 1024 px, ce cadre les rend ensemble : la
 * liste à gauche, MONTÉE UNE FOIS — défilement, Lentille et socket gardés d'une
 * conversation à l'autre —, le fil à droite, ou l'état « choisissez une
 * conversation » quand l'adresse est la liste. Le cadre est rendu à la MÊME
 * position de l'arbre pour les deux routes (`router.tsx`, option `frame`) :
 * c'est ce qui garde la liste montée quand l'adresse passe de l'une à l'autre.
 *
 * Sous 1024 px, et pour l'invité d'un lien (World Wide sans compte, qui n'a pas
 * de liste), il rend l'écran routé TEL QUEL : rien ne change.
 *
 * Le seuil est OBSERVÉ hors React (`matchMedia`, un abonnement par cadre),
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

function subscribeWide(onChange: () => void): () => void {
  const media = wideMedia();
  if (media === null) return () => {};
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const isWide = (): boolean => wideMedia()?.matches ?? false;

/* L'état vide du volet ne se charge que sur grand écran, à la première
   ouverture de la liste : ses libellés et son glyphe ne pèsent rien sur la
   première peinture du téléphone. */
const EmptyPane = lazy(() => import('./split-empty-pane'));

/* Ce que le volet montre pendant que l'écran du fil arrive — une surface
   vide, jamais un spinner : la liste à côté dit déjà où l'on est. */
const pending = <div className="h-dvh" aria-busy="true" />;

export function SplitFrame({ routeKey, screen, screenOf }: FrameProps): ReactNode {
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const guest = useStore(sessionStore, (state) => state.session.status === 'guest');
  const pane = splitPaneOf({ routeKey, wide, guest });
  const List = screenOf('list');
  if (pane === null || List === undefined) return screen;

  return (
    <div data-split-frame="" className="flex h-dvh overflow-hidden">
      <div
        data-split-list=""
        className="relative h-dvh w-[24rem] shrink-0 overflow-hidden border-e"
        style={{ borderColor: 'var(--color-ios-hairline)' }}
      >
        <ScrollportKeyScope.Provider value="/chats">
          <Suspense fallback={pending}>
            <List />
          </Suspense>
        </ScrollportKeyScope.Provider>
      </div>
      <div data-split-detail="" className="relative h-dvh min-w-0 flex-1 overflow-hidden">
        <Suspense fallback={pending}>{pane === 'thread' ? screen : <EmptyPane />}</Suspense>
      </div>
    </div>
  );
}
