import { Suspense, lazy, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import '@/styles/split-frame.css';

import { LazyFloatingMenus } from '@/components/floating-menus-lazy';
import { sessionStore } from '@/lib/api/session';
import type { FrameProps } from '@/lib/router';
import { isWide, splitPaneOf, subscribeWide } from '@/lib/view/split-query';
import { readSplitWidth, splitFrameStyleVars } from '@/lib/view/split-width';
import { ScrollportKeyScope } from '@/lib/view/use-scrollport-memory';

import { SPLIT_LIST_ID, SplitHandle } from './split-handle';

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
 * ENTRE LES DEUX, UN SÉPARATEUR QUI SE DÉPLACE (#10101) : la liste va de sa
 * largeur minimale à 40 % du cadre (`lib/view/split-width.ts`), par le geste,
 * le clavier ou le double-clic (`split-handle.tsx`). La largeur validée est un
 * état de CE cadre, relu de l'appareil au montage ; pendant le glisser, rien
 * ne se rend. La liste est un élément RETENU (`useMemo`) : valider une largeur
 * re-rend le cadre et son séparateur, jamais la liste ni le fil.
 *
 * LES DISQUES FLOTTANTS VIVENT DANS LA COLONNE DE LA LISTE (#10117) : sur
 * `/chats` comme sur `/c/:id` — ouvrir une conversation ne les retire ni ne
 * les déplace, et ils ne se posent jamais sur le volet du fil (son en-tête,
 * son composeur). La coquille ne les pose pas sur la fenêtre tant que ce cadre
 * est dessiné (`floatingMenusHost`, `lib/view/floating-gate.ts`).
 *
 * Sous 1024 px, et pour l'invité d'un lien (World Wide sans compte, qui n'a pas
 * de liste), il rend l'écran routé TEL QUEL : rien ne change.
 *
 * Ce module n'est JAMAIS dans la première peinture (#10086) : la table des
 * routes ne le charge qu'au moment où la règle (`lib/view/split-query.ts`)
 * accorde le cadre — grand écran, liste ou fil, lecteur avec une liste.
 */

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
  const frame = useRef<HTMLDivElement | null>(null);
  const [preferred, setPreferred] = useState<number | null>(readSplitWidth);
  const List = screenOf('list');
  const list = useMemo(() => (List === undefined ? null : <List />), [List]);
  const pane = splitPaneOf({ routeKey, wide, guest });
  if (pane === null || list === null) return screen;

  return (
    <div
      ref={frame}
      data-split-frame=""
      className="h-dvh overflow-hidden"
      style={splitFrameStyleVars(preferred) as CSSProperties}
    >
      <div id={SPLIT_LIST_ID} data-split-list="" className="relative h-dvh min-w-0 overflow-hidden">
        <ScrollportKeyScope.Provider value="/chats">
          <Suspense fallback={pending}>{list}</Suspense>
        </ScrollportKeyScope.Provider>
        <Suspense fallback={null}>
          <LazyFloatingMenus routeKey={routeKey} contained />
        </Suspense>
      </div>
      <SplitHandle frameRef={frame} preferred={preferred} onCommit={setPreferred} />
      <div data-split-detail="" className="relative h-dvh min-w-0 overflow-hidden">
        <Suspense fallback={pending}>{pane === 'thread' ? screen : <EmptyPane />}</Suspense>
      </div>
    </div>
  );
}
