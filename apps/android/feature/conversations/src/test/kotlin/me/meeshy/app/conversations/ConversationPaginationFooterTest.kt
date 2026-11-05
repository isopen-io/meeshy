package me.meeshy.app.conversations

import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.conversationlist.PaginationState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationPaginationFooterTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(state: PaginationState, hasMore: Boolean, count: Int, onLoadMore: () -> Unit = {}) =
        compose.setContent {
            MeeshyTheme {
                ConversationPaginationFooter(state, hasMore, count, onLoadMore)
            }
        }

    private fun assertSlot(state: PaginationState, hasMore: Boolean, count: Int) {
        show(state, hasMore, count)
        compose.onNodeWithTag(PAGINATION_FOOTER_TAG).assertHeightIsEqualTo(52.dp)
    }

    @Test
    fun `le créneau au repos fait cinquante-deux dp`() = assertSlot(PaginationState.Idle, true, 10)

    @Test
    fun `le créneau vide fait cinquante-deux dp`() = assertSlot(PaginationState.Idle, false, 10)

    @Test
    fun `le créneau du spinner fait cinquante-deux dp`() = assertSlot(PaginationState.LoadingMore, true, 10)

    @Test
    fun `le créneau de tout chargé fait cinquante-deux dp`() = assertSlot(PaginationState.Exhausted, false, 50)

    @Test
    fun `le créneau de l'erreur fait cinquante-deux dp`() = assertSlot(PaginationState.Failed("x"), true, 50)

    @Test
    fun `la sentinelle déclenche le chargement quand il reste des pages`() {
        var calls = 0
        show(PaginationState.Idle, hasMore = true, count = 100) { calls += 1 }
        compose.waitForIdle()
        assertEquals(1, calls)
        compose.onNodeWithTag(PAGINATION_SENTINEL_TAG).assertExists()
    }

    @Test
    fun `sans page restante il n'y a ni sentinelle ni déclenchement`() {
        var calls = 0
        show(PaginationState.Idle, hasMore = false, count = 100) { calls += 1 }
        compose.waitForIdle()
        assertEquals(0, calls)
        compose.onNodeWithTag(PAGINATION_SENTINEL_TAG).assertDoesNotExist()
    }

    @Test
    fun `tout chargé ne s'annonce qu'au-delà de trente conversations`() {
        show(PaginationState.Exhausted, hasMore = false, count = 31)
        compose.onNodeWithText("All conversations loaded").assertIsDisplayed()
    }

    @Test
    fun `une petite liste épuisée n'annonce rien`() {
        show(PaginationState.Exhausted, hasMore = false, count = 12)
        compose.onNodeWithText("All conversations loaded").assertDoesNotExist()
    }

    @Test
    fun `l'erreur propose Réessayer qui relance le chargement`() {
        var calls = 0
        show(PaginationState.Failed("hors ligne"), hasMore = true, count = 50) { calls += 1 }
        compose.onNodeWithText("Couldn't load more").assertIsDisplayed()
        compose.onNodeWithTag(PAGINATION_RETRY_TAG).performClick()
        assertEquals(1, calls)
    }
}
