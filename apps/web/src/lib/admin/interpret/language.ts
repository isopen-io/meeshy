import { getLanguageInfo, isSupportedLanguage } from '@meeshy/shared/utils/languages';

import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LES LANGUES, LES PAYS ET LES PLATEFORMES, NOMMÉS (#8876) — jamais un code.
 *
 * `Intl.DisplayNames` nomme dans la langue d'INTERFACE (« espagnol » pour un
 * lecteur français, « Spanish » pour un anglophone) ; le nom natif du
 * référentiel partagé ne sert que de repli, pour un code qu'`Intl` ne connaît
 * pas mais que Meeshy supporte.
 */
function displayName(code: string, language: InterfaceLanguage, type: 'language' | 'region'): string | null {
  try {
    return new Intl.DisplayNames([language], { type, fallback: 'none' }).of(code) ?? null;
  } catch {
    return null;
  }
}

/** « espagnol » → « Espagnol » : un nom posé seul (badge, cellule) ouvre par une majuscule. */
export function sentenceCase(text: string, language: InterfaceLanguage): string {
  const first = text.charAt(0);
  return first === '' ? text : `${first.toLocaleUpperCase(language)}${text.slice(1)}`;
}

export function languageName(code: string | null | undefined, language: InterfaceLanguage): string {
  const normalized = code?.trim() ?? '';
  if (normalized === '') return translateAdmin(language, 'admin.value.noLanguage');

  const named = displayName(normalized, language, 'language');
  if (named !== null && named.toLowerCase() !== normalized.toLowerCase()) return named;

  if (isSupportedLanguage(normalized)) {
    const info = getLanguageInfo(normalized);
    return info.nativeName ?? info.name;
  }
  return translateAdmin(language, 'admin.value.languageUnknown');
}

export function countryName(code: string | null | undefined, language: InterfaceLanguage): string {
  const normalized = code?.trim().toUpperCase() ?? '';
  if (normalized === '') return translateAdmin(language, 'admin.value.countryUnknown');
  const named = displayName(normalized, language, 'region');
  return named !== null && named !== normalized ? named : translateAdmin(language, 'admin.value.countryUnknown');
}

export function platformLabel(code: string | null | undefined, language: InterfaceLanguage): string {
  switch (code?.trim().toLowerCase()) {
    case 'ios':
      return translateAdmin(language, 'admin.value.platform.ios');
    case 'android':
      return translateAdmin(language, 'admin.value.platform.android');
    case 'web':
      return translateAdmin(language, 'admin.value.platform.web');
    case 'desktop':
    case 'macos':
    case 'windows':
    case 'linux':
      return translateAdmin(language, 'admin.value.platform.desktop');
    default:
      return translateAdmin(language, 'admin.value.platform.unknown');
  }
}
