export const serve = (content, readerLang) => {
  if (content.lang === readerLang) {
    return { text: content.text, lang: readerLang, originalLang: content.lang, translated: false }
  }
  const translation = content.translations?.[readerLang]
  if (translation === undefined) {
    throw new Error(`Prisme : « ${content.id ?? content.text} » n’a pas de traduction en ${readerLang}`)
  }
  return { text: translation, lang: readerLang, originalLang: content.lang, translated: true }
}
