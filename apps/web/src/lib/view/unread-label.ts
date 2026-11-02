import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE LA PASTILLE DE NON-LUS DIT À L'OREILLE** (#11575) — la phrase d'iOS,
 * `accessibility.unread_count` (`UnreadCountLabel.messages`), mot pour mot dans
 * les sept langues, accordée par `Intl.PluralRules` : l'arabe a six catégories,
 * et un `=== 1` n'en saurait que deux.
 *
 * Au-delà de 99, la pastille AFFICHE « 99+ » (`unreadBadgeText`) : l'oreille
 * entend la même borne, « plus de 99 messages non lus », jamais un « 99 » qui
 * serait un nombre faux présenté comme exact.
 *
 * Synchrone et embarquée : la pastille se rend dans la liste, dans l'en-tête du
 * fil et sur les sections, avant qu'aucun catalogue chargé par écran ne soit
 * garanti.
 */
type PluralForms = Readonly<Partial<Record<Intl.LDMLPluralRule, (count: string) => string>>> & {
  readonly other: (count: string) => string;
};

type UnreadPhrases = { readonly forms: PluralForms; readonly beyond: string };

const PHRASES: Readonly<Record<InterfaceLanguage, UnreadPhrases>> = {
  fr: { forms: { one: (n) => `${n} message non lu`, other: (n) => `${n} messages non lus` }, beyond: 'plus de 99 messages non lus' },
  en: { forms: { one: (n) => `${n} unread message`, other: (n) => `${n} unread messages` }, beyond: 'more than 99 unread messages' },
  es: { forms: { one: (n) => `${n} mensaje sin leer`, other: (n) => `${n} mensajes sin leer` }, beyond: 'más de 99 mensajes sin leer' },
  pt: { forms: { one: (n) => `${n} mensagem não lida`, other: (n) => `${n} mensagens não lidas` }, beyond: 'mais de 99 mensagens não lidas' },
  de: { forms: { one: (n) => `${n} ungelesene Nachricht`, other: (n) => `${n} ungelesene Nachrichten` }, beyond: 'mehr als 99 ungelesene Nachrichten' },
  it: { forms: { one: (n) => `${n} messaggio non letto`, other: (n) => `${n} messaggi non letti` }, beyond: 'più di 99 messaggi non letti' },
  ar: {
    forms: {
      one: () => 'رسالة واحدة غير مقروءة',
      two: () => 'رسالتان غير مقروءتين',
      few: (n) => `${n} رسائل غير مقروءة`,
      many: (n) => `${n} رسالة غير مقروءة`,
      other: (n) => `${n} رسالة غير مقروءة`,
    },
    beyond: 'أكثر من 99 رسالة غير مقروءة',
  },
};

/** Au-delà, la pastille affiche « 99+ » — la même borne que `unreadBadgeText`. */
const EXACT_UP_TO = 99;

export function unreadMessagesLabel(count: number, language: InterfaceLanguage): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  const { forms, beyond } = PHRASES[language];
  if (count > EXACT_UP_TO) return beyond;
  const whole = Math.trunc(count);
  const form = forms[new Intl.PluralRules(language).select(whole)] ?? forms.other;
  return form(String(whole));
}
