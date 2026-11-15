import { useMemo } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer, type Viewer } from '@/lib/api/viewer';

/**
 * QUI LIT, LU UNE SEULE FOIS (#6484) — `resolveViewer({ source, session })`
 * vivait recopié à deux sites (`comment-thread.tsx`, et le rail des Réels qui
 * en a besoin pour la MÊME garde, `CommentThread.canWrite`) : un lecteur
 * anonyme n'a NI l'un NI l'autre, la passerelle exigeant `registeredUser` sur
 * commenter ET repartager.
 *
 * **PAS `usePostGesture().menu.viewerId`** — cette valeur lit le
 * `sessionStore` NU (`status === 'authenticated' ? … : null`), qui ne
 * synthétise AUCUNE identité sous fixtures ; `resolveViewer` le fait
 * (`__FIXTURES__ && source === 'fixtures'` ⇒ un viewer non-anonyme). Les
 * confondre a fait disparaître les deux boutons de tout gate en fixtures
 * (mesuré : `check-reels.mjs`, `page.click` sur `[data-reel-gesture=
 * "repost"]` qui n'expirait jamais).
 */
export function useViewer(): Viewer {
  const session = useStore(sessionStore, (s) => s.session);
  return useMemo(() => resolveViewer({ source: apiDeps.source, session }), [session]);
}
