package me.meeshy.sdk.model.speech

/**
 * Choisit, parmi les langues dont le modèle est installé sur l'appareil, celle qui sert la
 * langue demandée. Miroir de `EdgeTranscriptionService.normalizedLocale` (iOS) : région exacte,
 * sinon région de l'appareil, sinon la première de la même langue.
 */
object OnDeviceLanguageMatch {

    fun resolve(requested: String, installed: Collection<String>, deviceRegion: String?): String? {
        val wanted = requested.replace('_', '-').trim()
        if (wanted.isEmpty()) return null
        installed.firstOrNull { it.equals(wanted, ignoreCase = true) }?.let { return it }
        val language = wanted.substringBefore('-').lowercase()
        val sameLanguage = installed.filter { it.substringBefore('-').equals(language, ignoreCase = true) }
        if (wanted.contains('-')) return null
        val region = deviceRegion?.takeIf { it.isNotBlank() }
        return sameLanguage.firstOrNull { tag -> region != null && tag.substringAfter('-', "").equals(region, true) }
            ?: sameLanguage.firstOrNull()
    }
}
