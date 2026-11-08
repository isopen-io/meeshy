package me.meeshy.sdk.model

import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.game.GameMergeOutcome
import me.meeshy.sdk.model.game.GameRevisionMerge
import me.meeshy.sdk.model.game.GameRevisionState
import me.meeshy.sdk.model.game.GameUpdatedEvent
import me.meeshy.sdk.model.profile.ProfileDecorUpdatedEvent
import me.meeshy.sdk.model.socket.SocketEventNames

/**
 * Les quatre familles d'événements de récompense, de progression et de décor poussées à la room personnelle du lecteur
 * (miroir des routes `conversationEngagementRoutes`, `gameStateRoutes` et `profileDecorRoutes` d'iOS) :
 * `engagement:post-updated`, `engagement:conversation-updated`, `game:updated` et `profile:decor-updated`.
 */
public sealed interface EngagementEvent {
    /** Ce qu'un post a rapporté au lecteur. */
    public data class PostUpdated(val snapshot: PostEngagementSnapshot) : EngagementEvent

    /** L'état « série · N (M) » du lecteur dans une conversation. */
    public data class ConversationUpdated(val snapshot: ConversationEngagementSnapshot) : EngagementEvent

    /** L'état du jeu changé ailleurs ; un bloc illisible se lit nul et fait relire la progression. */
    public data class GameUpdated(val event: GameUpdatedEvent) : EngagementEvent

    /** Le décor de profil équipé depuis un autre appareil. */
    public data class ProfileDecorUpdated(val event: ProfileDecorUpdatedEvent) : EngagementEvent
}

/** Lit la charge brute d'un événement d'engagement ; une charge illisible ou un nom étranger se lit `null`, jamais une erreur. */
public object EngagementEventDecoder {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    public fun decode(event: String, payload: String): EngagementEvent? = try {
        when (event) {
            SocketEventNames.ENGAGEMENT_POST_UPDATED ->
                EngagementEvent.PostUpdated(json.decodeFromString(PostEngagementSnapshot.serializer(), payload))
            SocketEventNames.ENGAGEMENT_CONVERSATION_UPDATED ->
                EngagementEvent.ConversationUpdated(json.decodeFromString(ConversationEngagementSnapshot.serializer(), payload))
            SocketEventNames.GAME_UPDATED ->
                EngagementEvent.GameUpdated(json.decodeFromString(GameUpdatedEvent.serializer(), payload))
            SocketEventNames.PROFILE_DECOR_UPDATED ->
                EngagementEvent.ProfileDecorUpdated(json.decodeFromString(ProfileDecorUpdatedEvent.serializer(), payload))
            else -> null
        }
    } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
        null
    }
}

/** Ce que l'applicateur du jeu fait d'un `game:updated` : ne rien faire, poser l'état reçu, ou relire la progression. */
public sealed interface GameRealtimeDecision {
    public data object Ignore : GameRealtimeDecision
    public data class Apply(val state: GameRevisionState) : GameRealtimeDecision
    public data object Refetch : GameRealtimeDecision
}

/** La règle de fusion de `game:updated` contre l'état tenu : hors ordre ignoré, bloc illisible = relecture. */
public object GameRealtimeRule {
    public fun decide(held: GameRevisionState?, event: GameUpdatedEvent): GameRealtimeDecision =
        when (val outcome = GameRevisionMerge.merge(held, event)) {
            GameMergeOutcome.Keep -> GameRealtimeDecision.Ignore
            is GameMergeOutcome.Replace -> GameRealtimeDecision.Apply(outcome.state)
            GameMergeOutcome.Refetch -> GameRealtimeDecision.Refetch
        }
}
