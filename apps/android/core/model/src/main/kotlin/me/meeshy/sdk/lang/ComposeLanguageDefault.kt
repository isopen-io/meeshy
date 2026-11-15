package me.meeshy.sdk.lang

/**
 * **La langue de composition par défaut** (iOS `ConversationViewRules.defaultComposeLanguage`, #11875) : la langue de
 * CONTENU que l'utilisateur a configurée dans l'app (système, régionale, personnalisée), sinon la langue du clavier
 * actif, sinon rien (l'appelant garde son défaut). **Jamais la locale appareil** : un francophone sur un téléphone en
 * anglais écrit en français ; la détection en direct corrige si le texte tapé change de langue.
 */
object ComposeLanguageDefault {

    fun of(
        prefs: LanguageResolver.ContentLanguagePreferences,
        keyboardLanguageTag: String?,
        supportedCodes: Set<String>? = null,
    ): String? {
        fun String?.supported(): String? =
            LanguageCodeNormalizer.normalize(this)?.takeIf { supportedCodes == null || it in supportedCodes }
        return prefs.systemLanguage.supported()
            ?: prefs.regionalLanguage.supported()
            ?: prefs.customDestinationLanguage.supported()
            ?: keyboardLanguageTag.supported()
    }
}
