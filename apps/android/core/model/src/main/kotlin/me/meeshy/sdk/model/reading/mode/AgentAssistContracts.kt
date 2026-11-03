package me.meeshy.sdk.model.reading.mode

import me.meeshy.sdk.model.reading.summary.ConversationEpisode

/** Ligne du pont ✦ portée par un agent. Sans preuve elle n'existe pas : [of] rend `null`. */
public class AgentBridgeLine private constructor(
    public val text: String,
    public val evidenceMessageIds: List<String>,
) {
    override fun equals(other: Any?): Boolean =
        other is AgentBridgeLine && other.text == text && other.evidenceMessageIds == evidenceMessageIds

    override fun hashCode(): Int = 31 * text.hashCode() + evidenceMessageIds.hashCode()

    override fun toString(): String = "AgentBridgeLine(text=$text, evidenceMessageIds=$evidenceMessageIds)"

    public companion object {
        public fun of(text: String, evidenceMessageIds: List<String>): AgentBridgeLine? =
            if (evidenceMessageIds.isEmpty()) null else AgentBridgeLine(text, evidenceMessageIds.toList())
    }
}

public data class AgentSuggestion(
    val id: String,
    val text: String,
    val targetMessageId: String?,
    val actionKey: String?,
)

public data class AgentShortcut(
    val id: String,
    val titleKey: String,
    val glyph: String,
    val payload: String,
)

/** Surfaces agent ✦ — miroir de `AgentAssistProviding` (iOS). */
public interface AgentAssistProviding {
    public suspend fun bridge(conversationId: String): AgentBridgeLine?
    public suspend fun suggestions(conversationId: String, anchoredToMessageId: String): List<AgentSuggestion>
    public suspend fun shortcuts(conversationId: String, anchoredToMessageId: String): List<AgentShortcut>
    public suspend fun episodeTitles(conversationId: String, episodes: List<ConversationEpisode>): Map<String, String>
}

/** Le SEUL fournisseur tant qu'aucun agent n'existe côté serveur : chaque méthode rend du vide. */
public object NullAgentAssistProvider : AgentAssistProviding {
    override suspend fun bridge(conversationId: String): AgentBridgeLine? = null
    override suspend fun suggestions(conversationId: String, anchoredToMessageId: String): List<AgentSuggestion> = emptyList()
    override suspend fun shortcuts(conversationId: String, anchoredToMessageId: String): List<AgentShortcut> = emptyList()
    override suspend fun episodeTitles(conversationId: String, episodes: List<ConversationEpisode>): Map<String, String> = emptyMap()
}
