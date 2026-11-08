package me.meeshy.sdk.model.search

import me.meeshy.sdk.lang.PrismCandidate
import me.meeshy.sdk.lang.PrismTranslationResolver
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.MessageEncryptionGuard
import me.meeshy.sdk.model.isoToEpochMillis

/** Un message trouvé, tel que la section « Messages » de la liste des conversations le montre. */
public data class ListMessageHit(
    val messageId: String,
    val conversationId: String,
    val createdAtMillis: Long,
    /** Le texte SERVI au lecteur (descente du Prisme), jamais une traduction étrangère. */
    val text: String,
    val senderName: String,
    /** Le titre affichable servi avec le message, quand sa conversation n'est pas dans le cache. */
    val conversationTitle: String = "",
    /** La photo servie avec ce titre (élue par la passerelle avec lui), quand la conversation n'est pas dans le cache. */
    val conversationAvatar: String? = null,
    /** Flouté (#16957) : trouvé, mais voilé ; [text] est alors vide. */
    val isVeiled: Boolean = false,
    /** Le média dont la transcription a répondu (#16958), `null` quand c'est le texte du message. */
    val transcriptMedia: SearchMediaKind? = null,
) {
    val excerpt: SearchExcerpt get() = SearchExcerpt.of(text, isVeiled, transcriptMedia)
}

/**
 * La loi de la section « Messages » de la recherche de la liste des conversations (#14619).
 *
 * - une requête compte à partir de deux caractères, espaces exclus ;
 * - un message protégé (chiffré, éphémère, à vue unique, supprimé, sans texte) n'est JAMAIS un
 *   résultat, même si une source l'a rendu : la garde est celle de l'index local
 *   ([MessageEncryptionGuard.searchableText]), fail-closed ;
 * - un message flouté est un résultat VOILÉ (#16957, #16474) : il se trouve, mais son texte ne
 *   quitte pas ce modèle ([ListMessageHit.isVeiled], [ListMessageHit.text] vide) ;
 * - un résultat trouvé par une transcription (#16958) peint la transcription et l'icône du média ;
 * - le texte affiché est celui du Prisme ([PrismTranslationResolver]) ; aucune traduction
 *   chiffrée n'est servie ;
 * - le serveur n'est jamais interrogé sur une conversation chiffrée de bout en bout ;
 * - la copie du serveur gagne sur la copie locale (texte servi plus frais), le plus récent d'abord.
 */
public object ListMessageSearch {

    public const val MIN_QUERY_LENGTH: Int = 2
    public const val DEBOUNCE_MS: Long = 300L
    public const val LIMIT: Int = 30
    public const val REMOTE_CONVERSATIONS: Int = 10
    public const val PER_CONVERSATION: Int = 5

    public fun queryOf(raw: String): String? = raw.trim().takeIf { it.length >= MIN_QUERY_LENGTH }

    public fun hitOf(message: ApiMessage, readerPrism: List<String>): ListMessageHit? {
        MessageEncryptionGuard.searchableText(message) ?: return null
        val veiled = MessageEncryptionGuard.isVeiled(message)
        return ListMessageHit(
            messageId = message.id,
            conversationId = message.conversationId,
            createdAtMillis = isoToEpochMillis(message.createdAt),
            text = if (veiled) "" else servedText(message, readerPrism),
            senderName = message.sender?.name.orEmpty(),
            isVeiled = veiled,
        )
    }

    /** Un résultat déjà servi par le serveur : l'extrait est `transcript?.text ?: content` ; un extrait blanc n'est pas un résultat. */
    public fun hitOf(served: GlobalMessageSearchHit): ListMessageHit? {
        val transcript = served.transcript?.takeIf { it.text.isNotBlank() }
        val text = transcript?.text
            ?: served.content.ifBlank { served.originalContent }.takeIf { it.isNotBlank() }
            ?: return null
        return ListMessageHit(
            messageId = served.id,
            conversationId = served.conversationId,
            createdAtMillis = isoToEpochMillis(served.createdAt),
            text = if (served.isBlurred) "" else text,
            senderName = served.sender?.displayName?.takeIf { it.isNotBlank() } ?: served.sender?.username.orEmpty(),
            conversationTitle = served.conversation?.title.orEmpty(),
            conversationAvatar = served.conversation?.avatar?.takeIf { it.isNotBlank() },
            isVeiled = served.isBlurred,
            transcriptMedia = transcript?.let { SearchMediaKind.of(it.mediaKind) },
        )
    }

    public fun hitsOf(messages: List<ApiMessage>, readerPrism: List<String>): List<ListMessageHit> =
        messages.mapNotNull { hitOf(it, readerPrism) }

    public fun remoteTargets(conversations: List<ApiConversation>, max: Int = REMOTE_CONVERSATIONS): List<String> =
        conversations
            .asSequence()
            .filterNot { EndToEndRegime.isEndToEnd(it.encryptionMode) }
            .map { it.id }
            .take(max)
            .toList()

    public fun merge(local: List<ListMessageHit>, remote: List<ListMessageHit>, limit: Int = LIMIT): List<ListMessageHit> =
        (remote + local)
            .distinctBy { it.messageId }
            .sortedByDescending { it.createdAtMillis }
            .take(limit)

    private fun servedText(message: ApiMessage, readerPrism: List<String>): String =
        PrismTranslationResolver.resolve(
            originalLanguage = message.originalLanguage,
            candidates = message.translations
                .filter { it.isEncrypted != true }
                .map { PrismCandidate(it.targetLanguage, it.translatedContent) },
            preferredLanguages = readerPrism,
        )?.text ?: message.content
}

/** Où en est la section « Messages » : un spinner n'y remplace JAMAIS des résultats déjà montrés. */
public enum class ListMessageSearchPhase { IDLE, SEARCHING, REVALIDATING, LOADED, FAILED }

/** L'état de la section « Messages » ; [query] est la requête qui a produit [hits]. */
public data class ListMessageSearchState(
    val query: String = "",
    val hits: List<ListMessageHit> = emptyList(),
    val phase: ListMessageSearchPhase = ListMessageSearchPhase.IDLE,
) {
    /** La section se montre dès qu'elle a des résultats, ou pendant une première recherche. */
    val showsSection: Boolean
        get() = phase != ListMessageSearchPhase.IDLE &&
            (hits.isNotEmpty() || phase == ListMessageSearchPhase.SEARCHING || phase == ListMessageSearchPhase.FAILED)

    public fun started(query: String): ListMessageSearchState = copy(
        query = query,
        phase = if (hits.isNotEmpty()) ListMessageSearchPhase.REVALIDATING else ListMessageSearchPhase.SEARCHING,
    )

    /** Les résultats de l'appareil, servis sans attendre ; [remotePending] dit si le serveur doit encore répondre. */
    public fun withLocal(query: String, local: List<ListMessageHit>, remotePending: Boolean): ListMessageSearchState {
        if (query != this.query) return this
        val phase = when {
            !remotePending -> ListMessageSearchPhase.LOADED
            local.isEmpty() -> ListMessageSearchPhase.SEARCHING
            else -> ListMessageSearchPhase.REVALIDATING
        }
        return copy(hits = ListMessageSearch.merge(local, emptyList()), phase = phase)
    }

    /** La réponse du serveur fondue dans le local ; une panne sans aucun résultat n'est jamais « aucun résultat ». */
    public fun withRemote(
        query: String,
        local: List<ListMessageHit>,
        remote: List<ListMessageHit>,
        failed: Boolean,
    ): ListMessageSearchState {
        if (query != this.query) return this
        val merged = ListMessageSearch.merge(local, remote)
        val phase = if (failed && merged.isEmpty()) ListMessageSearchPhase.FAILED else ListMessageSearchPhase.LOADED
        return copy(hits = merged, phase = phase)
    }

    public companion object {
        public val Idle: ListMessageSearchState = ListMessageSearchState()
    }
}
