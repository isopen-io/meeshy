import { useMemo } from 'react';

import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { Message } from '@/lib/api/types';

import { quotedPreviewOf } from './quoted-preview';

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
  /* LU DANS LE CORPS, pas dans le memo (#7556) : une valeur lue à l'intérieur
     sans être en dépendance survivrait à son propre changement. C'est une
     primitive — l'identité du memo reste stable d'un rendu à l'autre. */
  const interfaceLanguage = currentInterfaceLanguage();
  return useMemo(() => {
    if (message === undefined) return undefined;
    /* LE SITE UNIQUE (#7556) — `quotedPreviewOf` (`quoted-preview.ts`), la
       MÊME fonction que `Quote` (`components/message-blocks.tsx`) : le
       bandeau du composeur et la bulle gravée doivent citer le même message
       dans la MÊME langue, et un média SANS légende doit s'y nommer par son
       genre plutôt que de laisser la bande vide. Deux descentes parallèles
       sont exactement le défaut que le cycle 128 a fermé. */
    const preview = quotedPreviewOf({ quoted: message, readerLanguages, interfaceLanguage });
    return {
      author: message.sender?.displayName ?? message.senderId,
      excerpt: preview.text,
      /* La PAIRE, jamais le seul texte : la descente rend `language`
         précisément pour que l'hôte puisse DIRE dans quelle langue il sert
         (`lang`), comme `bubble.tsx` et `focal-row.tsx`. */
      ...(preview.language === '' ? {} : { language: preview.language }),
    };
  }, [message, readerLanguages, interfaceLanguage]);
}
