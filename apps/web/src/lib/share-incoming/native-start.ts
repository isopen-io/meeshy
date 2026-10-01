import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { coqueCourante } from '@/lib/native-shell';
import { openSendSheet } from '@/lib/send/send-sheet-store';

import { listenNativeShares, readNativeShare } from './native-inbox';
import { startNativeShareInbox } from './native-runtime';

/**
 * Le câblage réel de la boîte de réception de la coque (#8884) — appelé par
 * `main.tsx` derrière `__SHELL__`, en `import()` : ni ce module ni le pont
 * n'entrent dans la première peinture. Rend l'arrêt, ou `null` hors coque.
 */
export const startNativeShareInboxInShell = (): (() => void) | null =>
  startNativeShareInbox({
    coque: coqueCourante(),
    source: apiDeps.source,
    sessionStore,
    read: (coque) => readNativeShare({ coque }),
    listen: listenNativeShares,
    open: openSendSheet,
  });
