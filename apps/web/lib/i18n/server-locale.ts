import 'server-only';

import { cookies, headers } from 'next/headers';
import {
  LOCALE_COOKIE_NAME,
  resolveInterfaceLocale,
  type InterfaceLocale,
} from './locale-config';

/**
 * Resolves the interface locale for the current request, server-side.
 *
 * Reads the persisted locale cookie first (written by the client language
 * store), then falls back to the request's `Accept-Language` header, then to
 * the default locale. This is what makes `<html lang>`, `og:locale` and page
 * metadata coherent with the language the user actually sees — without any
 * URL-based locale routing (see apps/web/decisions.md:45).
 */
export async function getServerLocale(): Promise<InterfaceLocale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveInterfaceLocale({
    cookie: cookieStore.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });
}
