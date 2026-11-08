package me.meeshy.sdk.model.search

import kotlinx.serialization.Serializable

/**
 * Un message trouvé par `GET /messages/search` (#14619, `packages/shared/types/global-search.ts`) :
 * le serveur a déjà élu le texte servi par le Prisme du lecteur ([content]) et écarté ce que la
 * recherche ne doit jamais rendre (e2ee, protégé, hors appartenance). Aucune présence n'y voyage.
 */
@Serializable
public data class GlobalMessageSearchHit(
    val id: String,
    val conversationId: String,
    val createdAt: String? = null,
    val messageType: String = "text",
    val content: String = "",
    val servedLanguage: String? = null,
    val originalContent: String = "",
    val originalLanguage: String? = null,
    val sender: GlobalMessageSearchSender? = null,
    val conversation: GlobalMessageSearchConversation? = null,
)

@Serializable
public data class GlobalMessageSearchSender(
    val id: String? = null,
    val userId: String? = null,
    val displayName: String? = null,
    val username: String? = null,
    val avatar: String? = null,
)

@Serializable
public data class GlobalMessageSearchConversation(
    val id: String? = null,
    val identifier: String? = null,
    val type: String? = null,
    val title: String? = null,
    val avatar: String? = null,
)
