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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.displayedAvatar
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.model.auth.ServerEnvironmentResolver
import me.meeshy.sdk.model.world.PublicConversationLink
import me.meeshy.sdk.model.world.WorldEntry
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.AnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.world.WorldEntryMemory

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
    /** L'adresse publique à partager (lien d'invité ou World Wide), `null` : pas de bouton « Partager ». */
    val publicShareUrl: String? = null,
)

/**
 * Tient [ChatHeaderState] : la conversation ouverte (avatar, pair) et la somme des non-lus du
 * cache, dont on retire ceux de la conversation ouverte (miroir de
 * `ConversationViewModel+Lifecycle` iOS, qui exclut la conversation affichée).
 */
class ChatHeaderController @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val sessionRepository: SessionRepository,
    private val worldMemory: WorldEntryMemory,
    private val guestSessions: AnonymousSessionStore,
    private val config: MeeshyConfig,
) : ChatController {

    private val _state = MutableStateFlow(ChatHeaderState())
    val state: StateFlow<ChatHeaderState> = _state.asStateFlow()

    override fun attach(host: ChatControllerHost) {
        val webOrigin = ServerEnvironmentResolver.webOrigin(ServerEnvironmentResolver.serverOrigin(config.apiBaseUrl))
        val guestLinkId = MutableStateFlow<String?>(null)
        val world = MutableStateFlow(worldMemory.entry)
        val guestLinkRead = host.scope.launch {
            guestLinkId.value = runCatching { guestSessions.load()?.linkId }.getOrNull()
        }
        host.scope.launch {
            combine(
                conversationRepository.conversationStream(host.conversationId),
                conversationRepository.totalUnreadCount(),
                sessionRepository.currentUser,
                guestLinkId,
                world,
            ) { conversation, total, user, linkId, served ->
                headerStateOf(conversation, total, user?.id, linkId, served, webOrigin)
            }.collect { _state.value = it }
        }
        host.scope.launch {
            // Seule une conversation `global` interroge `GET /world`, une fois par lancement.
            guestLinkRead.join()
            val needs = conversationRepository.conversationStream(host.conversationId)
                .first { it != null }
                ?.let { PublicConversationLink.needsWorldEntry(it.type, guestLinkId.value) } ?: false
            if (needs && world.value == null) world.value = runCatching { worldMemory.load() }.getOrNull()
        }
    }

    internal companion object {
        /** Pure : l'état d'en-tête d'une conversation lue par [readerId], pour un total de non-lus. */
        fun headerStateOf(
            conversation: ApiConversation?,
            totalUnread: Int,
            readerId: String?,
            guestLinkId: String? = null,
            world: WorldEntry? = null,
            webOrigin: String = "",
        ): ChatHeaderState {
            val peer = conversation?.interlocutor(readerId)
            return ChatHeaderState(
                avatarUrl = conversation?.displayedAvatar(readerId),
                peerUsername = peer?.username,
                peerDisplayName = peer?.name,
                otherConversationsUnread = (totalUnread - (conversation?.unreadCount ?: 0)).coerceAtLeast(0),
                publicShareUrl = webOrigin.takeIf { it.isNotBlank() }?.let {
                    PublicConversationLink.url(conversation?.type, conversation?.identifier, guestLinkId, world, it)
                },
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
