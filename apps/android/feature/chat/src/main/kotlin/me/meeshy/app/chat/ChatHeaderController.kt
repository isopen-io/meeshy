package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.displayedAvatar
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.session.SessionRepository

/**
 * Ce que l'en-tête de conversation montre et que [ChatUiState] (figé) ne porte pas : la photo
 * de l'avatar de droite, le pseudo du pair pour ouvrir son profil, et le total des non-lus des
 * AUTRES conversations, que le bouton retour affiche (iOS `otherConversationsUnread`).
 */
data class ChatHeaderState(
    /** La photo de l'avatar : celle du pair en direct, celle de la conversation sinon. */
    val avatarUrl: String? = null,
    /** Le pseudo du pair d'un direct (profil à ouvrir), `null` pour un groupe. */
    val peerUsername: String? = null,
    /** Le nom affiché du pair d'un direct, `null` pour un groupe. */
    val peerDisplayName: String? = null,
    /** Les non-lus de toutes les conversations SAUF celle-ci, jamais négatif. */
    val otherConversationsUnread: Int = 0,
)

/**
 * Tient [ChatHeaderState] : la conversation ouverte (avatar, pair) et la somme des non-lus du
 * cache, dont on retire ceux de la conversation ouverte (miroir de
 * `ConversationViewModel+Lifecycle` iOS, qui exclut la conversation affichée).
 */
class ChatHeaderController @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val sessionRepository: SessionRepository,
) : ChatController {

    private val _state = MutableStateFlow(ChatHeaderState())
    val state: StateFlow<ChatHeaderState> = _state.asStateFlow()

    override fun attach(host: ChatControllerHost) {
        host.scope.launch {
            combine(
                conversationRepository.conversationStream(host.conversationId),
                conversationRepository.totalUnreadCount(),
                sessionRepository.currentUser,
            ) { conversation, total, user -> headerStateOf(conversation, total, user?.id) }
                .collect { _state.value = it }
        }
    }

    internal companion object {
        /** Pure : l'état d'en-tête d'une conversation lue par [readerId], pour un total de non-lus. */
        fun headerStateOf(conversation: ApiConversation?, totalUnread: Int, readerId: String?): ChatHeaderState {
            val peer = conversation?.interlocutor(readerId)
            return ChatHeaderState(
                avatarUrl = conversation?.displayedAvatar(readerId),
                peerUsername = peer?.username,
                peerDisplayName = peer?.name,
                otherConversationsUnread = (totalUnread - (conversation?.unreadCount ?: 0)).coerceAtLeast(0),
            )
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ChatHeaderModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: ChatHeaderController): ChatController
}

/** L'état d'en-tête vide, quand aucun [ChatHeaderController] n'est contribué (tests, aperçus). */
internal val NO_HEADER: StateFlow<ChatHeaderState> = MutableStateFlow(ChatHeaderState())
