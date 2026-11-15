package me.meeshy.sdk.socket

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.model.EngagementEvent
import me.meeshy.sdk.model.PostEngagementSnapshot
import me.meeshy.sdk.model.game.GameUpdatedEvent
import me.meeshy.sdk.model.profile.ProfileDecorUpdatedEvent

/**
 * Le canal unique des récompenses, de la progression de jeu et du décor de profil poussés en direct (miroir d'iOS
 * `PostEngagementChannel` et des routes `conversationEngagement` / `gameState` / `profileDecor`) : les quatre familles
 * se lisent ici en flux, sans que l'écran de fil, de flamme ou de profil connaisse la socket. Un événement dont aucune
 * fonctionnalité n'est abonnée ne coûte rien : un flux sans collecteur n'émet nulle part.
 */
@Singleton
class EngagementChannel(
    val postUpdated: Flow<PostEngagementSnapshot>,
    val conversationUpdated: Flow<ConversationEngagementSnapshot>,
    val gameUpdated: Flow<GameUpdatedEvent>,
    val profileDecorUpdated: Flow<ProfileDecorUpdatedEvent>,
) {

    @Inject
    constructor(
        messages: MessageSocketManager,
        social: SocialSocketManager,
        conversations: ConversationSocketEventsManager,
    ) : this(
        postUpdated = social.postEngagementUpdated,
        conversationUpdated = conversations.events.filterIsInstance<ConversationEngagementSnapshot>(),
        gameUpdated = messages.gameUpdated,
        profileDecorUpdated = messages.profileDecorUpdated,
    )

    /** Les quatre familles sur un seul flux typé. */
    val events: Flow<EngagementEvent> = merge(
        postUpdated.map<PostEngagementSnapshot, EngagementEvent> { EngagementEvent.PostUpdated(it) },
        conversationUpdated.map { EngagementEvent.ConversationUpdated(it) },
        gameUpdated.map { EngagementEvent.GameUpdated(it) },
        profileDecorUpdated.map { EngagementEvent.ProfileDecorUpdated(it) },
    )
}
