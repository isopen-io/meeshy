package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationListPaginationTest {

    private val oldest = "6512f2a0e1b4c3d2a1908877"
    private val newer = "6512f2a0e1b4c3d2a1908878"

    @Test
    fun `un nextCursor servi passe tel quel sans examen`() {
        assertThat(ConversationListPagination.cursor(nextCursor = "opaque-curseur", oldestLocalId = oldest))
            .isEqualTo("opaque-curseur")
    }

    @Test
    fun `sans nextCursor la plus ancienne conversation locale à identifiant serveur sert de curseur`() {
        assertThat(ConversationListPagination.cursor(nextCursor = null, oldestLocalId = oldest)).isEqualTo(oldest)
        assertThat(ConversationListPagination.cursor(nextCursor = "", oldestLocalId = oldest)).isEqualTo(oldest)
    }

    @Test
    fun `un identifiant fabriqué n'est jamais envoyé comme curseur`() {
        assertThat(ConversationListPagination.cursor(null, "conv-hydrate")).isNull()
        assertThat(ConversationListPagination.cursor(null, "pending_123")).isNull()
        assertThat(ConversationListPagination.cursor(null, "6512f2a0e1b4c3d2a190887")).isNull()
        assertThat(ConversationListPagination.cursor(null, "6512f2a0e1b4c3d2a190887z")).isNull()
        assertThat(ConversationListPagination.cursor(null, null)).isNull()
    }

    @Test
    fun `une page qui apporte du nouveau et avance le curseur continue`() {
        val verdict = ConversationListPagination.verdict(
            requestCursor = oldest, nextCursor = newer, newIds = 12, serverHasMore = true,
        )
        assertThat(verdict).isEqualTo(PaginationVerdict.Continue(nextCursor = newer))
    }

    @Test
    fun `un curseur identique force l'épuisement`() {
        val verdict = ConversationListPagination.verdict(
            requestCursor = oldest, nextCursor = oldest, newIds = 5, serverHasMore = true,
        )
        assertThat(verdict).isEqualTo(PaginationVerdict.Exhausted(nextCursor = oldest))
    }

    @Test
    fun `une page sans aucun nouvel identifiant force l'épuisement`() {
        val verdict = ConversationListPagination.verdict(
            requestCursor = oldest, nextCursor = newer, newIds = 0, serverHasMore = true,
        )
        assertThat(verdict).isInstanceOf(PaginationVerdict.Exhausted::class.java)
    }

    @Test
    fun `une page sans nextCursor alors que le serveur promet une suite force l'épuisement`() {
        val verdict = ConversationListPagination.verdict(
            requestCursor = oldest, nextCursor = null, newIds = 3, serverHasMore = true,
        )
        assertThat(verdict).isInstanceOf(PaginationVerdict.Exhausted::class.java)
    }

    @Test
    fun `le serveur qui dit fini épuise même après une page pleine`() {
        val verdict = ConversationListPagination.verdict(
            requestCursor = oldest, nextCursor = newer, newIds = 40, serverHasMore = false,
        )
        assertThat(verdict).isEqualTo(PaginationVerdict.Exhausted(nextCursor = newer))
    }

    @Test
    fun `la suite se charge à cinq rangs de la fin ou moins`() {
        assertThat(ConversationListPagination.shouldLoadMore(lastVisibleIndex = 94, rowCount = 100)).isFalse()
        assertThat(ConversationListPagination.shouldLoadMore(lastVisibleIndex = 95, rowCount = 100)).isTrue()
        assertThat(ConversationListPagination.shouldLoadMore(lastVisibleIndex = 99, rowCount = 100)).isTrue()
    }

    @Test
    fun `une liste vide ou courte ne déclenche rien tant qu'aucune ligne n'est visible`() {
        assertThat(ConversationListPagination.shouldLoadMore(lastVisibleIndex = -1, rowCount = 0)).isFalse()
        assertThat(ConversationListPagination.shouldLoadMore(lastVisibleIndex = 2, rowCount = 3)).isTrue()
    }

    @Test
    fun `le pied rend la sentinelle seulement quand il reste des pages à l'état de repos`() {
        assertThat(ConversationListPagination.footer(PaginationState.Idle, hasMore = true, conversationCount = 10))
            .isEqualTo(PaginationFooter.Sentinel)
        assertThat(ConversationListPagination.footer(PaginationState.Idle, hasMore = false, conversationCount = 10))
            .isEqualTo(PaginationFooter.Blank)
    }

    @Test
    fun `le pied montre le spinner pendant le chargement`() {
        assertThat(ConversationListPagination.footer(PaginationState.LoadingMore, hasMore = true, conversationCount = 100))
            .isEqualTo(PaginationFooter.Spinner)
    }

    @Test
    fun `le pied annonce tout chargé au delà de trente conversations seulement`() {
        assertThat(ConversationListPagination.footer(PaginationState.Exhausted, hasMore = false, conversationCount = 31))
            .isEqualTo(PaginationFooter.AllLoaded)
        assertThat(ConversationListPagination.footer(PaginationState.Exhausted, hasMore = false, conversationCount = 30))
            .isEqualTo(PaginationFooter.Blank)
    }

    @Test
    fun `le pied porte l'erreur et son Réessayer`() {
        assertThat(ConversationListPagination.footer(PaginationState.Failed("hors ligne"), hasMore = true, conversationCount = 50))
            .isEqualTo(PaginationFooter.Failure)
    }

    @Test
    fun `la page est de cent conversations`() {
        assertThat(ConversationListPagination.PAGE_SIZE).isEqualTo(100)
    }
}
