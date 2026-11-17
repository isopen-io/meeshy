import { translateLinkFamilies, type PlainLinkFamiliesKey } from '@/lib/i18n-link-families-catalog';
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

/** Les familles dont le hub sait compter quelque chose : le parrainage n'a pas encore de chiffre servi. */
export type CountedFamily = 'share' | 'tracking' | 'community';

const CAPTIONS: Readonly<Record<CountedFamily, Readonly<Record<'one' | 'other', PlainLinkFamiliesKey>>>> = {
  share: { one: 'links.face.figure.joined.one', other: 'links.face.figure.joined.other' },
  tracking: { one: 'links.face.figure.clicks.one', other: 'links.face.figure.clicks.other' },
  community: { one: 'links.face.figure.communities.one', other: 'links.face.figure.communities.other' },
};

/** Le mot sous le chiffre, accordé par les règles de pluriel de la langue (« 1 clic », « 0 clic » en français, « 0 clicks » en anglais). */
export function hubFigureCaption(language: InterfaceLanguage, family: CountedFamily, count: number): string {
  const form = new Intl.PluralRules(language).select(count) === 'one' ? 'one' : 'other';
  return translateLinkFamilies(language, CAPTIONS[family][form]);
}
