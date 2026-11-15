package me.meeshy.sdk.share

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.model.share.ShareCommunity
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareSearchResults
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.model.share.ShareRecipientDirectory as ShareDirectoryLaw
import javax.inject.Inject
import javax.inject.Singleton

/** Où en est le chargement des destinataires — miroir de `LoadState` de la feuille (iOS). */
enum class ShareDirectoryLoad { LOADING, CACHED_STALE, LOADED, OFFLINE, ERROR }

/** Ce que la feuille connaît déjà, et d'où cela vient. */
data class ShareDirectorySnapshot(
    val conversations: List<ShareRecipient>,
    val people: List<ShareRecipient>,
    val communities: List<ShareCommunity>,
    val load: ShareDirectoryLoad,
) {
    val showsSkeleton: Boolean get() = ShareDirectoryLaw.showsSkeleton(conversations, people, load == ShareDirectoryLoad.LOADING)
}

/**
 * **Les destinataires du partage, cache d'abord** (#14774) — miroir de `LiveShareRecipientDirectory`
 * et de `ShareSheetViewModel.loadRecipients` (iOS). Aucune UI ici.
 *
 * - [open] émet D'ABORD ce que Room et les caches savent (conversations, amis, communautés) : un
 *   squelette n'est permis que si tout est vide ; puis la première page de 50 revalide en silence et le
 *   frais passe devant le cache. Une panne ne l'écrase jamais : hors ligne = état discret.
 * - [search] fusionne personnes, conversations et communautés trouvées par le serveur ; hors ligne il rend
 *   le vide, et le filtre local ([ShareDirectoryLaw.view]) reste seul affiché.
 */
@Singleton
class ShareRecipientRepository @Inject constructor(
    private val sources: ShareRecipientSources,
    private val network: NetworkMonitor,
) {

    fun open(currentUserId: String?, sourceConversationId: String? = null): Flow<ShareDirectorySnapshot> = flow {
        val blocked = sources.blockedUserIds()
        val people = ShareRecipientDirectory.fromFriends(sources.cachedFriends(), currentUserId, blocked)
        val communities = sources.cachedCommunities().map { ShareCommunity(it.id, it.name, it.avatar) }
        val cached = recipients(sources.cachedConversations(), currentUserId, sourceConversationId, blocked)
        emit(ShareDirectorySnapshot(cached, people, communities, if (cached.isEmpty()) ShareDirectoryLoad.LOADING else ShareDirectoryLoad.CACHED_STALE))

        if (!network.isOnline.value) {
            emit(ShareDirectorySnapshot(cached, people, communities, ShareDirectoryLoad.OFFLINE))
            return@flow
        }
        val page = try {
            sources.freshConversations()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        if (page == null) {
            emit(ShareDirectorySnapshot(cached, people, communities, if (cached.isEmpty()) ShareDirectoryLoad.ERROR else ShareDirectoryLoad.OFFLINE))
            return@flow
        }
        val merged = ShareDirectoryLaw.revalidated(cached, recipients(page, currentUserId, sourceConversationId, blocked))
        emit(ShareDirectorySnapshot(merged, people, communities, ShareDirectoryLoad.LOADED))
    }

    suspend fun search(query: String, currentUserId: String?): ShareSearchResults {
        if (!network.isOnline.value) return ShareSearchResults.EMPTY
        val blocked = sources.blockedUserIds()
        return coroutineScope {
            val conversations = async { safe { sources.searchConversations(query) } }
            val users = async { safe { sources.searchUsers(query) } }
            val communities = async { safe { sources.searchCommunities(query) } }
            ShareSearchResults(
                people = users.await()
                    .filter { it.id != currentUserId && it.id !in blocked }
                    .map { user ->
                        ShareRecipient.person(
                            userId = user.id,
                            title = user.displayName?.takeIf { it.isNotBlank() } ?: user.username,
                            detail = ShareRecipient.Detail.Handle(user.username),
                            avatarUrl = user.avatar?.takeIf { it.isNotBlank() },
                        )
                    },
                conversations = recipients(
                    conversations.await().filter { found ->
                        ShareDirectoryLaw.isReachableConversation(
                            type = found.type,
                            participantUserIds = found.participants.mapNotNull { it.userId },
                            currentUserId = currentUserId.orEmpty(),
                            isMember = null,
                        )
                    },
                    currentUserId, null, blocked,
                ),
                communities = communities.await().map { ShareCommunity(it.id, it.name, it.avatar) },
            )
        }
    }

    private fun recipients(
        conversations: List<me.meeshy.sdk.model.ApiConversation>,
        currentUserId: String?,
        sourceConversationId: String?,
        blocked: Set<String>,
    ): List<ShareRecipient> = ShareRecipientDirectory.fromConversations(
        conversations = conversations,
        sourceConversationId = sourceConversationId,
        currentUserId = currentUserId,
        blockedUserIds = blocked,
    )

    private suspend fun <T> safe(block: suspend () -> List<T>): List<T> =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            emptyList()
        }
}
