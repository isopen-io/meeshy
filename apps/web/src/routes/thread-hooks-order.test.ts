import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LES RULES OF HOOKS DE `ThreadScreen` (revue-correction #6175, défaut
 * BLOQUANT 1) — LE DÉFAUT RÉELLEMENT LIVRÉ : trois hooks (`useMemo` pour
 * `replyTo`, deux `useCallback` pour `handleComposerSend`/
 * `handleCancelReply`) avaient été posés APRÈS les trois retours anticipés
 * (`ThreadRefused`/`ThreadError`/`ThreadSkeleton`) qui narrowent
 * `conversation`. React lève « Rendered more hooks than during the previous
 * render. » exactement à la transition `pending → données` : le premier
 * rendu (squelette) exécute N hooks, le second (fil réel) en exécute N+3.
 *
 * POURQUOI UN TÉMOIN DE SOURCE ICI, plutôt qu'un rendu complet de
 * `ThreadScreen` : aucun écran de ce dépôt (`conversations.tsx` compris) n'a
 * de témoin de rendu intégral — `useParams`/`useRoute` n'exposent aucun
 * contexte de test (`Context` n'est pas exporté par `lib/router.tsx`), et le
 * graphe de dépendances de cet écran (TanStack Query, le virtualiseur, les
 * magasins zustand, le socket de frappe…) en ferait un harnais disproportionné
 * pour CE défaut précis, qui est un défaut d'ORDRE TEXTUEL, pas de valeur
 * rendue. Un témoin de source, comme `safe-area.test.ts` déjà dans ce
 * répertoire, PROUVE la même chose que le motif de review qui a trouvé le
 * défaut (`grep -nE 'return <Thread(Refused|Error|Skeleton)|useMemo\(|useCallback\('`),
 * rejoué automatiquement à chaque lot.
 *
 * La stratégie : retirer commentaires et JSX (où `use[A-Z]…(` ne désigne
 * jamais un appel de hook — un nom de composant `<UseSomething>` n'existe
 * pas dans ce fichier, mais la prudence coûte peu), puis vérifier qu'AUCUN
 * appel de hook ne suit, dans le texte, le premier des trois retours
 * anticipés de `ThreadScreen`.
 */

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'thread.tsx');
const source = readFileSync(FILE, 'utf8');

/** Retire les commentaires (bloc ET ligne) pour ne garder que du CODE — un
 * doc-comment qui CITE `useRef(new Date())` en prose ne doit pas compter. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length)).replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

const code = stripComments(source);

// Les NOMS DE HOOKS RÉACT/hooks maison de ce fichier — pas une regex
// générique `use[A-Z]` qui matcherait aussi un futur composant nommé
// `<UseCase>` : la liste est FERMÉE et se relit d'un coup d'œil.
const HOOK_NAMES = [
  'useState',
  'useMemo',
  'useCallback',
  'useEffect',
  'useLayoutEffect',
  'useRef',
  'useReducer',
  'useContext',
  'useSyncExternalStore',
  'useQueryClient',
  'useStore',
  'useParams',
  'useOnline',
  'useConversationsSnapshot',
  'useReaderLanguages',
  'useReplyToPreview',
  'useLiveAnnouncer',
  'useSend',
  'usePersistedReadingMode',
  'useThreadDraft',
  'useThreadData',
  'useVirtualizer',
  'useThreadScene',
  'useThreadInsets',
  'useThreadChromeSignals',
  'useThreadTyping',
  'useMessageMenu',
] as const;

const EARLY_RETURN_MARKERS = [
  "return <ThreadRefused />",
  "return <ThreadError onRetry={threadData.refetch} />",
  "return <ThreadSkeleton />",
] as const;

describe('ThreadScreen — Rules of Hooks : aucun hook après un retour anticipé (#6175, défaut bloquant 1)', () => {
  test('les trois retours anticipés existent bien (le témoin mesure le bon fichier)', () => {
    for (const marker of EARLY_RETURN_MARKERS) expect(code).toContain(marker);
  });

  test('AUCUN appel de hook ne suit, dans le texte, le premier retour anticipé', () => {
    const returnIndexes = EARLY_RETURN_MARKERS.map((marker) => code.indexOf(marker));
    const firstReturnIndex = Math.min(...returnIndexes);
    expect(firstReturnIndex).toBeGreaterThan(-1);

    const offenders: string[] = [];
    for (const name of HOOK_NAMES) {
      const callPattern = new RegExp(`\\b${name}\\(`, 'g');
      for (const match of code.matchAll(callPattern)) {
        if ((match.index ?? -1) > firstReturnIndex) offenders.push(`${name}() à l'offset ${match.index}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
