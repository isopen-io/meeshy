/**
 * LA LANGUE D'UN MESSAGE, ÉTABLIE PAR LE SERVEUR (#9635) — jamais la seule déclaration du client
 * (`Message.originalLanguage` vient de `composeLanguage` côté iOS, qui retombe sur la langue préférée quand la
 * détection est incertaine). La détection du traducteur (`POST /detect-language`) fait foi.
 *
 * **Fail-closed** : un texte trop court pour qu'une langue s'y lise (moins de trois mots), un traducteur muet,
 * lent ou qui répond « inconnu » ⇒ `null`, et aucun défi de langue n'avance. Le repli « fr » du chemin d'envoi
 * (`MessageValidator.detectLanguage`) n'a pas sa place ici : il fabriquerait un message « étranger » pour tout
 * compte dont la langue n'est pas le français.
 */

const MIN_WORDS = 3;
const TIMEOUT_MS = 3000;
const MAX_CHARS = 5000;
const UNKNOWN = new Set(['', 'unknown', 'und', 'auto']);

export type LanguageDetector = (text: string) => Promise<string | null>;

export const baseLanguage = (code: string | null | undefined): string => (code ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';

export const enoughWords = (text: string): boolean => (text.match(/\p{L}+/gu) ?? []).length >= MIN_WORDS;

export const translatorLanguageDetector: LanguageDetector = async (text) => {
  if (!enoughWords(text)) return null;
  try {
    const translatorUrl = process.env.ML_API_URL || 'http://translator:8000';
    const response = await fetch(`${translatorUrl}/detect-language`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: [...text].slice(0, MAX_CHARS).join('') }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const { language } = (await response.json()) as { language?: unknown };
    const base = typeof language === 'string' ? baseLanguage(language) : '';
    return UNKNOWN.has(base) ? null : base;
  } catch {
    return null;
  }
};
