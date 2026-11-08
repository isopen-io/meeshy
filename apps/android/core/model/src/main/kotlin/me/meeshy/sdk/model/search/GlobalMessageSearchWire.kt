package me.meeshy.sdk.model.search

import kotlinx.serialization.Serializable

/**
 * Un message trouvé par `GET /messages/search` (#14619, `packages/shared/types/global-search.ts`) :
 * le serveur a déjà élu le texte servi par le Prisme du lecteur ([content]) et écarté ce que la
 * recherche ne doit jamais rendre (e2ee, éphémère, vue unique, hors appartenance). Aucune présence
 * n'y voyage. [isBlurred] voile l'extrait (#16957) ; [transcript] porte la transcription qui a
 * répondu (#16958). Les trois ne sont servis qu'au client qui envoie `X-Search-Caps`.
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
    val isBlurred: Boolean = false,
    val match: String? = null,
    val transcript: GlobalMessageSearchTranscript? = null,
) {
    val matchKind: SearchMatch get() = SearchMatch.of(match)
}

/** La transcription qui a répondu, servie par le Prisme du lecteur ; elle se peint, ne se joue pas. */
@Serializable
public data class GlobalMessageSearchTranscript(
    val attachmentId: String? = null,
    val mediaKind: String? = null,
    val text: String = "",
    val servedLanguage: String? = null,
    val durationMs: Long? = null,
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
