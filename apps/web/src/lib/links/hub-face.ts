import type { InterfaceLanguage } from '@/lib/interface-language';

/** Une adresse se lit sans schéma, sans « www. » ni barre finale : `soundcloud.com/aissa`. */
export function addressHost(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./u, '');
    return `${host}${parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/u, '')}`;
  } catch {
    return url;
  }
}

/** Le chiffre d'une famille, dans la langue : une valeur que le serveur ne sert pas n'est pas un zéro. */
export const hubFigure = (language: InterfaceLanguage, value: number | null): string | null => (value === null ? null : new Intl.NumberFormat(language).format(value));
