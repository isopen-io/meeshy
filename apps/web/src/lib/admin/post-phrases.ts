import type { AdminPostRow } from '@/lib/api/admin-posts';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { interpretPostType } from '@/lib/admin/interpret/enums';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES PHRASES D'UNE PUBLICATION** (#8876) — ce que la liste et la fiche disent
 * en mots plutôt qu'en valeurs brutes.
 *
 * Le pluriel vient de `Intl.PluralRules` de la langue d'interface, jamais d'un
 * « s » collé : « 1 personne », pas « 1 personnes ». Une langue à plus de deux
 * catégories (l'arabe) retombe sur la forme `other` pour tout ce qui n'est pas
 * `one` — la phrase reste grammaticale en français et en anglais, et
 * approximative ailleurs tant que la passe de traduction n'a pas eu lieu.
 */
const pluralOf = (count: number, language: InterfaceLanguage): 'one' | 'other' =>
  new Intl.PluralRules(language).select(count) === 'one' ? 'one' : 'other';

export type PostExcerpt = {
  readonly kind: 'text' | 'restricted' | 'media' | 'mood' | 'none';
  readonly text: string;
};

/**
 * La colonne « Extrait » : le texte quand il y en a un ; « Contenu à audience
 * restreinte » pour une audience choisie (le décodeur n'a jamais gardé le texte) ;
 * à défaut de texte, les médias (« Story · 2 médias »), puis l'humeur d'un
 * statut ; sinon « Sans texte ». Une ligne n'est jamais vide : une cellule vide
 * se lit comme une donnée manquante, pas comme une publication muette.
 */
export function postExcerptOf(row: AdminPostRow, language: InterfaceLanguage): PostExcerpt {
  if (row.restricted) return { kind: 'restricted', text: translateAdmin(language, 'admin.posts.restricted') };
  if (row.excerpt !== null) return { kind: 'text', text: row.excerpt };
  if (row.mediaCount > 0) {
    const type = interpretPostType(row.type, language).label;
    const key = `admin.posts.mediaOnly.${pluralOf(row.mediaCount, language)}` as const;
    return { kind: 'media', text: translateAdmin(language, key, { type, count: formatCount(row.mediaCount, language) }) };
  }
  if (row.moodEmoji !== null) return { kind: 'mood', text: row.moodEmoji };
  return { kind: 'none', text: translateAdmin(language, 'admin.posts.noText') };
}

/**
 * La TAILLE d'une audience choisie : « Visible par 3 personnes choisies » (`ONLY`),
 * « Masquée à 2 personnes » (`EXCEPT`). `null` pour toute autre audience ou une
 * taille non servie — jamais une phrase qui inventerait un nombre.
 */
export function audiencePhrase(visibility: string | null, count: number | null, language: InterfaceLanguage): string | null {
  if (count === null) return null;
  const params = { count: formatCount(count, language) };
  const plural = pluralOf(count, language);
  if (visibility === 'ONLY') return translateAdmin(language, `admin.posts.audience.only.${plural}`, params);
  if (visibility === 'EXCEPT') return translateAdmin(language, `admin.posts.audience.except.${plural}`, params);
  return null;
}

export function translationsPhrase(count: number, language: InterfaceLanguage): string {
  if (count === 0) return translateAdmin(language, 'admin.posts.content.translations.none');
  return translateAdmin(language, `admin.posts.content.translations.${pluralOf(count, language)}`, { count: formatCount(count, language) });
}

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export function mediaKindOf(mimeType: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}
