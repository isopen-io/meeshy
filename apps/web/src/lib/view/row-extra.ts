import { rowMenuText } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LE SUPPLÉMENT DE LA RANGÉE MAGNIFIÉE, DANS LA LANGUE DU LECTEUR — la date
 * pleine et le compte de membres s'écrivaient `AAAA-MM-JJ` et « N membres » en
 * dur : du français et de l'ISO technique devant un lecteur anglophone ou
 * arabe, alors que tout le reste de la rangée suit le Prisme.
 */
export function memberCountLabel(count: number, language: InterfaceLanguage): string {
  const word = rowMenuText(language, count === 1 ? 'listRow.members.one' : 'listRow.members.other');
  return `${new Intl.NumberFormat(language).format(count)} ${word}`;
}

export function rowDateLabel(at: Date | string | number | undefined, language: InterfaceLanguage): string {
  if (at === undefined) return '';
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date);
}
