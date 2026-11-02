package me.meeshy.sdk.conversation

import javax.inject.Inject
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.isDirect

/** Ce que rend [DirectConversationOpener.openOrCreate] ; l'UI traduit l'échec en toast. */
sealed interface DirectOpenResult {
    data class Opened(val conversationId: String, val created: Boolean) : DirectOpenResult

    /** La création a été mise en file hors ligne : le direct s'ouvrira au retour du réseau. */
    data object Queued : DirectOpenResult

    /** « Impossible d'ouvrir la conversation ». */
    data object Failed : DirectOpenResult
}

/** Couture du dépôt de conversations (le [ConversationRepository] en production). */
interface DirectConversationSource {
    suspend fun cachedDirectWith(userId: String): ApiConversation?
    suspend fun directConversationWith(userId: String): DirectConversationResolution
}

/**
 * « Écrire » : ouvre ou crée la conversation directe avec une personne — un seul geste pour le
 * répertoire, les affiliés, le clavier, Découvrir et la carte de visite (miroir de
 * `openDirectConversation`, iOS). Une conversation de groupe n'est jamais prise pour un direct.
 */
class DirectConversationOpener(private val source: DirectConversationSource) {

    @Inject
    constructor(repository: ConversationRepository) : this(RepositorySource(repository))

    /** Cherche d'abord dans le cache local, sans réseau. */
    suspend fun existingDirectId(userId: String): String? =
        source.cachedDirectWith(userId)?.takeIf { it.isDirect }?.id

    suspend fun openOrCreate(userId: String): DirectOpenResult {
        if (userId.isBlank()) return DirectOpenResult.Failed
        existingDirectId(userId)?.let { return DirectOpenResult.Opened(it, created = false) }
        return when (val resolution = source.directConversationWith(userId)) {
            is DirectConversationResolution.Found -> opened(resolution.conversation, created = false)
            is DirectConversationResolution.Created -> opened(resolution.conversation, created = true)
            is DirectConversationResolution.Queued -> DirectOpenResult.Queued
            is DirectConversationResolution.Failed -> DirectOpenResult.Failed
        }
    }

    private fun opened(conversation: ApiConversation, created: Boolean): DirectOpenResult =
        if (conversation.isDirect) DirectOpenResult.Opened(conversation.id, created) else DirectOpenResult.Failed

    private class RepositorySource(private val repository: ConversationRepository) : DirectConversationSource {
        override suspend fun cachedDirectWith(userId: String) = repository.cachedDirectWith(userId)
        override suspend fun directConversationWith(userId: String) = repository.directConversationWith(userId)
    }
}
