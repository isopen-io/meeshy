package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.model.isDirect
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import me.meeshy.sdk.util.resolveSafeMediaUrl

/** Où l'écran d'appel lit le visuel du correspondant d'un appel : une suite de visuels, du plus rapide au plus complet. */
fun interface CallPeerVisualSource {
    fun visualFor(config: CallConfig): Flow<CallPeerVisual>
}

/**
 * Résout le visuel du correspondant, cache d'abord (miroir de `CallView.resolveRemoteProfile`) :
 *
 * 1. la conversation en cache (Room, sans réseau) élit le correspondant d'un direct et donne sa
 *    photo — elle s'affiche avant tout aller-retour ;
 * 2. son profil public (`GET /directory/people/:id`) apporte la bannière et le contour équipé,
 *    lu dans le catalogue d'apparence embarqué.
 *
 * Un groupe n'a pas de correspondant unique : il prête son propre avatar et sa bannière. Toute
 * adresse passe par [resolveSafeMediaUrl] (politique média, #12197) — refusée, elle ne part pas.
 * Un échec réseau garde le visuel déjà émis : l'écran n'a jamais moins que ce que le cache savait.
 */
class CallPeerVisualResolver @Inject constructor(
    private val conversations: ConversationRepository,
    private val users: UserRepository,
    private val catalog: AppearanceCatalogLoader,
    private val session: SessionRepository,
    private val meeshyConfig: MeeshyConfig,
) : CallPeerVisualSource {

    override fun visualFor(config: CallConfig): Flow<CallPeerVisual> = flow {
        val selfId = session.currentUser.value?.id
        val conversation = conversationOf(config.conversationId)
        val interlocutor = conversation?.interlocutor(selfId)
        val cached = CallPeerVisual(
            avatarUrl = safe(config.peerAvatarUrl) ?: safe(interlocutor?.avatarUrl) ?: safe(groupAvatar(conversation)),
            bannerUrl = safe(config.peerBannerUrl) ?: safe(groupBanner(conversation)),
        )
        val me = session.currentUser.value
        val selfName = me?.effectiveDisplayName?.takeIf { it.isNotBlank() }
        val selfAvatar = safe(me?.avatar)
        if (cached != CallPeerVisual.EMPTY) emit(cached.copy(selfName = selfName, selfAvatarUrl = selfAvatar))
        val peerId = config.peerId.ifBlank { interlocutor?.userId.orEmpty() }
        if (peerId.isBlank() || peerId == selfId) return@flow
        val profile = attempt { users.getProfile(peerId).getOrNull() } ?: return@flow
        emit(visualOf(profile, cached).copy(selfName = selfName, selfAvatarUrl = selfAvatar))
    }

    private suspend fun conversationOf(id: String): ApiConversation? {
        if (id.isBlank()) return null
        return attempt { conversations.cachedById(id) } ?: attempt { conversations.getById(id).getOrNull() }
    }

    private suspend fun visualOf(profile: MeeshyUser, cached: CallPeerVisual): CallPeerVisual {
        val equipped = profile.servedDecor.avatarRing
        val ring = equipped?.let { item -> attempt { catalog.catalog().ring(item.pack, item.item) } }
        return CallPeerVisual(
            avatarUrl = safe(profile.avatar) ?: cached.avatarUrl,
            bannerUrl = safe(profile.banner) ?: cached.bannerUrl,
            ring = ring,
        )
    }

    private fun groupAvatar(conversation: ApiConversation?): String? =
        conversation?.takeUnless { it.isDirect }?.avatar

    private fun groupBanner(conversation: ApiConversation?): String? =
        conversation?.takeUnless { it.isDirect }?.banner

    private fun safe(url: String?): String? =
        url?.takeIf { it.isNotBlank() }?.let { resolveSafeMediaUrl(it, meeshyConfig.apiBaseUrl) }

    private suspend fun <T> attempt(block: suspend () -> T?): T? =
        try {
            block()
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (_: Exception) {
            null
        }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallPeerVisualModule {
    @Binds
    fun bindCallPeerVisualSource(impl: CallPeerVisualResolver): CallPeerVisualSource
}
