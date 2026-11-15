package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.MessageTranslationsPayload
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageChatRestApi
import me.meeshy.sdk.net.apiCall

/**
 * Lit TOUTES les traductions texte d'un message (`GET /messages/{id}/translations`) et les range dans le cache par le
 * chemin d'une traduction reçue en direct : l'explorateur de langues les voit apparaître sans rien porter lui-même.
 * Jamais appelé pour le contenu d'un post, dont les traductions arrivent par le post (ce chemin ne rendrait qu'un 404).
 * Une panne réseau n'écrase rien : le cache reste ce qu'il était.
 */
@Singleton
class MessageTranslationsFetcher internal constructor(
    private val read: suspend (messageId: String) -> MessageTranslationsPayload?,
    private val store: suspend (messageId: String, language: String, text: String) -> Unit,
) {
    @Inject
    constructor(api: MessageChatRestApi, messages: MessageRepository) : this(
        read = { id -> (apiCall { api.translations(id) } as? NetworkResult.Success)?.data },
        store = { id, language, text -> messages.applyTranslation(id, language, text) },
    )

    /** Range chaque traduction lue ; rend leur nombre (0 hors ligne ou sans rien à ranger). */
    suspend fun fetch(messageId: String): Int {
        val translations = read(messageId)?.usable().orEmpty()
        translations.forEach { (language, text) -> store(messageId, language, text) }
        return translations.size
    }
}
