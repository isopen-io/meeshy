import { cookies, headers } from 'next/headers';

import { LOCALE_COOKIE_NAME, resolveDocumentLocale, type InterfaceLocale } from './lang-attr';

/**
 * La langue d'interface de la requete courante, resolue SERVEUR — la meme source
 * que celle qui alimentera le Prisme.
 *
 * Lire cookie + en-tetes rend la coquille dynamique : c'est assume, le role
 * PREMIER est rendu par contenu et n'est de toute facon pas statifiable.
 */
export async function getServerLocale(): Promise<InterfaceLocale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  return resolveDocumentLocale({
    cookie: cookieStore.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });
}
