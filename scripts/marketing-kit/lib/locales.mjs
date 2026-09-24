export const KIT_LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'ar']

const APP_STORE_LOCALES = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it',
  pt: 'pt-BR',
  ar: 'ar-SA',
}

const CATALOG_LOCALES = { pt: 'pt-BR' }

const DATE_LOCALES = { ar: 'ar-SA-u-nu-latn', pt: 'pt-BR', en: 'en-US' }

export const directionOf = (lang) => (lang === 'ar' ? 'rtl' : 'ltr')

export const appStoreLocale = (lang) => {
  const locale = APP_STORE_LOCALES[lang]
  if (!locale) throw new Error(`langue hors kit : ${lang}`)
  return locale
}

export const catalogLocale = (lang) => CATALOG_LOCALES[lang] ?? lang

export const formatDate = (lang, isoDate, options = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Intl.DateTimeFormat(DATE_LOCALES[lang] ?? lang, options).format(new Date(isoDate))

export const formatNumber = (lang, value) =>
  new Intl.NumberFormat(DATE_LOCALES[lang] ?? lang).format(value)
