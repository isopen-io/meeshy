import { useMemo } from 'react';

import { served } from '@/lib/api/prism';
import type { Message } from '@/lib/api/types';

/**
 * LA CITATION PRÉ-ADRESSÉE DU COMPOSEUR — ce que `thread.tsx` transmet à
 * `Composer` (`replyTo`) pour bâtir sa bande de réponse. `language` est
 * OMISE (jamais posée à `undefined`, `exactOptionalPropertyTypes`) quand le
 * texte servi est déjà dans la langue du document.
 */
export type ReplyToPreview = {
  readonly author: string;
  readonly excerpt: string;
  readonly language?: string;
};

/**
 * LA CITATION DU COMPOSEUR PRÉ-ADRESSÉ, MÉMOÏSÉE (#5695, écart 8 ;
 * revue-correction #6175, défaut majeur 2) — extrait de `thread.tsx` pour
 * que le memo soit TESTABLE seul (`use-reply-preview.test.tsx`), hors du
 * graphe de dépendances entier de l'écran (routeur, TanStack Query,
 * virtualiseur…).
 *
 * `served()` (`lib/api/prism.ts`) rend un littéral NEUF à CHAQUE appel — deux
 * `return` distincts, aucun cache. Il doit donc être invoqué DANS le corps
 * du `useMemo`, jamais passé en dépendance d'un memo qui l'engloberait :
 * placé en dépendance, il défait le memo à CHAQUE rendu — précisément
 * pendant qu'une citation est armée, le seul cas que ce memo prétend
 * couvrir. `message` et `readerLanguages` sont les deux seules dépendances,
 * et les deux sont STABLES : `message` vient d'un tableau mémoïsé
 * (`mergeTimeline`, `thread.tsx`), `readerLanguages` de
 * `useReaderLanguages()` (également mémoïsé).
 */
export function useReplyToPreview(params: {
  readonly message: Message | undefined;
  readonly readerLanguages: readonly string[];
}): ReplyToPreview | undefined {
  const { message, readerLanguages } = params;
  return useMemo(() => {
    if (message === undefined) return undefined;
    const servedReply = served({
      preferredLanguages: readerLanguages,
      originalLanguage: message.originalLanguage,
      translations: message.translations,
      original: message.content,
    });
    return {
      author: message.sender?.displayName ?? message.senderId,
      excerpt: servedReply.text,
      /* La PAIRE, jamais le seul texte : `served()` rend `language`
         précisément pour que l'hôte puisse DIRE dans quelle langue il sert
         (`lang`), comme `bubble.tsx` et `focal-row.tsx`. */
      ...(servedReply.language === '' ? {} : { language: servedReply.language }),
    };
  }, [message, readerLanguages]);
}
