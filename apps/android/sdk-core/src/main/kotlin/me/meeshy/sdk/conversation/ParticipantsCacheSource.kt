package me.meeshy.sdk.conversation

import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.store.CacheCursorStore
import me.meeshy.sdk.cache.store.RoomCacheStore
import me.meeshy.sdk.cache.store.swrFlow
import me.meeshy.sdk.model.MemberRosterPage
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.cache.PaginationCursor
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite
import kotlinx.coroutines.flow.Flow

/** Les participants deja charges d'une conversation et ce qu'il faut pour demander la page suivante. */
data class ParticipantsPages(
    val members: List<PaginatedParticipant>,
    val nextCursor: String?,
    val hasMore: Boolean,
)

/**
 * Participants pagines d'une conversation sur le CacheStore generique (iOS `CachePolicy.participants` : 24 h,
 * 5 min de fraicheur). Une cle par conversation ; la premiere page REMPLACE (horloge avancee), une page suivante
 * s'AJOUTE sans rendre la cle faussement fraiche. Le curseur et `hasMore` sont ranges avec la liste : un demarrage
 * a froid reprend le defilement la ou il s'etait arrete.
 *
 * Presence (loi 2026-08-25) : ni rangee ni restituee — absente = aucun point d'avatar.
 */
class ParticipantsCacheSource(
    private val store: RoomCacheStore<PaginatedParticipant>,
    private val cursors: CacheCursorStore,
    private val fence: AccountFence? = null,
) {
    suspend fun ticket(): AccountTicket? = fence?.currentTicket()

    suspend fun cached(conversationId: String): ParticipantsPages? {
        val rows = store.loadIgnoringExpiry(conversationId)?.items ?: return null
        val cursor = cursors.load(conversationId)
        return ParticipantsPages(rows.map { it.withoutServedPresence() }, cursor?.nextCursor, cursor?.hasMore ?: false)
    }

    suspend fun replaceFirstPage(conversationId: String, page: MemberRosterPage, ticket: AccountTicket?) {
        fence.commitOrWrite(ticket) {
            store.saveFetched(page.members.distinctBy { it.id }.map { it.withoutServedPresence() }, conversationId)
            cursors.save(PaginationCursor(page.nextCursor, page.hasMore), conversationId)
        }
    }

    suspend fun appendPage(conversationId: String, page: MemberRosterPage, ticket: AccountTicket?) {
        fence.commitOrWrite(ticket) {
            val known = store.loadIgnoringExpiry(conversationId)?.items ?: return@commitOrWrite
            val ids = known.mapTo(HashSet()) { it.id }
            val added = page.members.filter { ids.add(it.id) }.map { it.withoutServedPresence() }
            store.savePreservingFreshness(known + added, conversationId)
            cursors.save(PaginationCursor(page.nextCursor, page.hasMore), conversationId)
        }
    }

    suspend fun invalidate(conversationId: String) = store.clear(conversationId)

    /** Le curseur et `hasMore` ranges avec la liste ; `null` = aucune page rangee. */
    suspend fun cursor(conversationId: String): PaginationCursor? = cursors.load(conversationId)

    /** La liste cache-first : disque d'abord, revalidation silencieuse de la premiere page si non fraiche. */
    fun results(
        conversationId: String,
        fetchFirstPage: suspend () -> MemberRosterPage,
    ): Flow<CacheResult<List<PaginatedParticipant>>> =
        store.swrFlow(conversationId, select = { rows -> rows.map { it.withoutServedPresence() } }, revalidate = {
            val ticket = ticket()
            replaceFirstPage(conversationId, fetchFirstPage(), ticket)
        })

    private fun PaginatedParticipant.withoutServedPresence(): PaginatedParticipant =
        if (isOnline == null && lastActiveAt == null) this else copy(isOnline = null, lastActiveAt = null)

    companion object {
        const val NAMESPACE: String = "participants_pages"
    }
}
