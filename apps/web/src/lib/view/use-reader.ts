import { useMemo } from 'react';
import { useStore } from 'zustand/react';

import { currentDeviceLocale } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { READER_LOCALE, resolveReaderLanguages } from '@/lib/reader';

/**
 * LE PRISME DU LECTEUR, EN VUE (#5650, F6, étape 3) — le SITE UNIQUE qui
 * abonne un composant au Prisme réel.
 *
 * `useStore` est appelé TROIS FOIS, une par PRIMITIVE
 * (`systemLanguage`/`regionalLanguage`/`customDestinationLanguage`), JAMAIS
 * sur `s.session.user` en bloc : un objet reconstruit à chaque rendu de
 * `zustand` re-déclencherait le `useMemo` ci-dessous à CHAQUE rendu de
 * l'hôte, exactement la leçon du CLAUDE.md racine (§ Prisme, cycle 123) —
 * « `preferredLanguages` est un tableau, donc son IDENTITÉ change à chaque
 * rendu chez tout hôte qui le construit en ligne ».
 */
export type ReaderPrism = {
  readonly languages: readonly string[];
  readonly locale: string;
};

export function useReaderLanguages(): ReaderPrism {
  const status = useStore(sessionStore, (s) => s.session.status);
  const systemLanguage = useStore(sessionStore, (s) =>
    s.session.status === 'authenticated' ? s.session.user.systemLanguage : undefined,
  );
  const regionalLanguage = useStore(sessionStore, (s) =>
    s.session.status === 'authenticated' ? s.session.user.regionalLanguage : undefined,
  );
  const customDestinationLanguage = useStore(sessionStore, (s) =>
    s.session.status === 'authenticated' ? s.session.user.customDestinationLanguage : undefined,
  );

  const languages = useMemo(
    () =>
      resolveReaderLanguages({
        source: apiDeps.source,
        session: { status, user: { systemLanguage, regionalLanguage, customDestinationLanguage } },
        deviceLocale: currentDeviceLocale(),
      }),
    [status, systemLanguage, regionalLanguage, customDestinationLanguage],
  );

  return { languages, locale: languages[0] ?? READER_LOCALE };
}
