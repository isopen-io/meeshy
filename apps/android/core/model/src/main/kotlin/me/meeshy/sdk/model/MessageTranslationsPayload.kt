package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * `data` de `GET /messages/{id}/translations` : un OBJET qui range la liste sous `translations` à côté des métadonnées du
 * message — pas un tableau nu (miroir de `TranslationsPayload` de `MessageLanguageDetailView`, iOS). Seuls les deux champs
 * lus sont déclarés : une ligne sans langue ou sans texte est écartée, jamais une erreur de décodage.
 */
@Serializable
data class MessageTranslationsPayload(
    val translations: List<Item> = emptyList(),
) {
    @Serializable
    data class Item(
        val targetLanguage: String = "",
        val translatedContent: String = "",
    )

    /** Les traductions exploitables, langue normalisée (rognée, minuscule) ; la dernière d'une langue l'emporte. */
    fun usable(): List<Pair<String, String>> =
        translations
            .map { it.targetLanguage.trim().lowercase() to it.translatedContent }
            .filter { (language, text) -> language.isNotEmpty() && text.isNotBlank() }
            .associate { it }
            .toList()
}
