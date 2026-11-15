package me.meeshy.sdk.notification

import androidx.room.withTransaction
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.conversation.ConversationRefreshSignal
import me.meeshy.sdk.conversation.MessageEntityFactory
import me.meeshy.sdk.conversation.MessageIdReconciliation
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.push.PushMessageRef
import me.meeshy.sdk.model.push.PushPayload
import me.meeshy.sdk.model.push.PushPrefetchPolicy
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.rawApiCall
import timber.log.Timber

/** Rapatrie un post social nommé par un push dans le cache du fil (couture : le dépôt de stories l'implémente). */
fun interface PushPostPrefetcher {
    suspend fun prefetch(postId: String)
}

/**
 * Le préchargement d'un push (miroir de `NSEDataSync` + `NSEMessagePrePersister`, iOS) : quand un message ARRIVE, il est
 * rapatrié et inséré dans Room SANS remplacement (contenu ORIGINAL et langue d'origine, jamais la traduction ; horloge
 * serveur), le post d'une notification sociale rejoint le cache, et l'accusé de remise part.
 *
 * Fail-closed : rien ne s'écrit sans utilisateur connecté ; une conversation chiffrée de bout en bout refuse un message
 * en clair. Tout échec est avalé : le préchargement est une avance, jamais un prérequis (le fil se rafraîchit à l'ouverture).
 */
@Singleton
class PushPrefetchRepository @Inject constructor(
    private val database: MeeshyDatabase,
    private val clock: CacheClock,
    private val signal: ConversationRefreshSignal,
    private val messageApi: MessageApi,
    private val conversationApi: ConversationApi,
    private val posts: PushPostPrefetcher,
    private val tokenStore: TokenStore,
) {

    suspend fun prefetch(payload: PushPayload) {
        if (!tokenStore.isAuthenticated || tokenStore.userId == null) return
        val plan = PushPrefetchPolicy.plan(payload)
        plan.message?.let { swallowing("message") { prefetchMessage(it, payload) } }
        plan.postId?.let { swallowing("post") { posts.prefetch(it) } }
        plan.deliveryReceipt?.let { swallowing("accusé de remise") { acknowledge(it) } }
    }

    private suspend fun prefetchMessage(ref: PushMessageRef, payload: PushPayload) {
        val response = when (val result = rawApiCall { messageApi.listAround(ref.conversationId, ref.messageId) }) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> return
        }
        val served = response.data?.firstOrNull { it.id == ref.messageId }?.takeIf { response.success } ?: return
        val row = MessageEntityFactory.cached(
            message = served,
            cachedAt = clock.nowMillis(),
            conversationId = ref.conversationId,
            threadEncrypted = EndToEndRegime.isEndToEnd(payload.conversationEncryptionMode),
        )
        val inserted = database.withTransaction {
            if (MessageIdReconciliation.locate(database, ref.messageId) != null) return@withTransaction false
            database.messageDao().insertIfAbsent(listOf(row)).any { it != IGNORED }
        }
        if (inserted) signal.notify(setOf(ref.conversationId))
    }

    private suspend fun acknowledge(ref: PushMessageRef) {
        rawApiCall { conversationApi.markReceived(ref.conversationId) }
    }

    private suspend fun swallowing(what: String, block: suspend () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "Préchargement du push (%s) en échec", what)
        }
    }

    private companion object {
        const val IGNORED = -1L
    }
}
