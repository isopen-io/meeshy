package me.meeshy.sdk.user

import me.meeshy.sdk.model.contacts.DirectoryContact
import me.meeshy.sdk.model.contacts.DirectoryFilter
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContactDirectoryApi
import me.meeshy.sdk.net.api.DirectoryApi
import me.meeshy.sdk.net.api.PresenceEntry
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.pagedApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Lecture du repertoire et de la presence — port de `listAll` / `ContactDirectoryService.page`.
 *
 * La presence n'est jamais fabriquee : une entree absente de la charge servie reste absente
 * (aucun point), le client ne comble rien (loi de visibilite de la passerelle).
 */
@Singleton
class DirectoryRepository @Inject constructor(
    private val contactDirectoryApi: ContactDirectoryApi,
    private val directoryApi: DirectoryApi,
) {
    /** Le repertoire ENTIER, page par page (curseur) ; `updatedSince` ne relit que le delta. */
    suspend fun listAll(
        filter: DirectoryFilter = DirectoryFilter.All,
        query: String? = null,
        updatedSince: String? = null,
        pageSize: Int = PAGE_SIZE,
        maxPages: Int = MAX_PAGES,
    ): NetworkResult<List<DirectoryContact>> {
        val all = mutableListOf<DirectoryContact>()
        var cursor: String? = null
        repeat(maxPages) {
            val page = pagedApiCall {
                contactDirectoryApi.page(
                    limit = pageSize,
                    filter = filter.wire,
                    cursor = cursor,
                    query = query?.trim()?.takeIf { q -> q.isNotEmpty() },
                    updatedSince = updatedSince,
                )
            }
            when (page) {
                is NetworkResult.Failure -> return page
                is NetworkResult.Success -> {
                    all += page.data.data
                    val next = page.data.pagination?.nextCursor
                    if (!hasMore(page.data.data.size, pageSize, page.data.pagination?.hasMore) || next == null) {
                        return NetworkResult.Success(all)
                    }
                    cursor = next
                }
            }
        }
        return NetworkResult.Success(all)
    }

    /** Presence servie, par id ; les ids sans entree servie n'apparaissent pas. */
    suspend fun presence(userIds: List<String>): NetworkResult<Map<String, PresenceEntry>> {
        val ids = userIds.distinct().filter { it.isNotEmpty() }
        if (ids.isEmpty()) return NetworkResult.Success(emptyMap())
        val served = mutableMapOf<String, PresenceEntry>()
        for (chunk in ids.chunked(MAX_PRESENCE_IDS)) {
            when (val result = apiCall { directoryApi.presence(chunk.joinToString(",")) }) {
                is NetworkResult.Failure -> return result
                is NetworkResult.Success -> result.data.users.forEach { served[it.userId] = it }
            }
        }
        return NetworkResult.Success(served)
    }

    companion object {
        const val PAGE_SIZE = 100
        const val MAX_PAGES = 500
        const val MAX_PRESENCE_IDS = 200

        /** Le serveur fait foi quand il le dit ; sinon une page PLEINE en annonce une autre. */
        fun hasMore(received: Int, pageSize: Int, serverHasMore: Boolean?): Boolean {
            if (received <= 0) return false
            return serverHasMore ?: (received >= pageSize)
        }
    }
}
