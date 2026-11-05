package me.meeshy.app.calls

import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallHistoryPeer
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** L'onglet « Appels » : squelette à froid, vide, liste, dialogue de confirmation et bannière rejetable. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallsTabTest {

    @get:Rule
    val compose = createComposeRule()

    private fun record(callId: String, name: String) = CallRecord(
        callId = callId,
        conversationId = "c-$callId",
        conversationType = "direct",
        mode = "p2p",
        status = "ended",
        direction = "incoming",
        isVideo = false,
        startedAt = "2026-07-01T10:00:00Z",
        durationSec = 30,
        peer = CallHistoryPeer(userId = "u-$callId", username = name, displayName = name),
    )

    private fun body(state: CallHistoryUiState, opened: MutableList<String> = mutableListOf()) {
        compose.setContent {
            MeeshyTheme {
                CallJournalBody(
                    state = state,
                    listState = rememberLazyListState(),
                    onOpenDetail = { opened += it.callId },
                    onRedial = { _, _ -> },
                    onHide = {},
                    onRefresh = {},
                    onLoadMoreIfNeeded = {},
                    onLoadMore = {},
                    onRetry = {},
                )
            }
        }
    }

    @Test
    fun `une liste vide hors recherche dit qu'aucun appel n'est récent`() {
        body(CallHistoryUiState(hasMore = false))

        compose.onNodeWithText("Aucun appel récent").assertIsDisplayed()
        compose.onNodeWithText("Le journal couvre les trois derniers mois.").assertIsDisplayed()
    }

    @Test
    fun `une recherche sans résultat nomme la requête`() {
        body(CallHistoryUiState(hasMore = false, searchQuery = "zoe"))

        compose.onNodeWithText("Aucun appel ne correspond à « zoe »").assertIsDisplayed()
    }

    @Test
    fun `les lignes en cache s'affichent et un toucher ouvre le détail`() {
        val opened = mutableListOf<String>()
        body(CallHistoryUiState(records = listOf(record("a", "Zoé")), hasMore = false), opened)

        compose.onNodeWithText("Zoé").performClick()

        assertThat(opened).containsExactly("a")
    }

    @Test
    fun `la confirmation de tout effacer rappelle que les autres gardent leur journal`() {
        var confirmed = false
        compose.setContent {
            MeeshyTheme { CallHistoryClearAllDialog(onConfirm = { confirmed = true }, onDismiss = {}) }
        }

        compose.onNodeWithText("Effacer tout le journal d'appels ?").assertIsDisplayed()
        compose.onNodeWithText("Les autres participants gardent le leur.").assertIsDisplayed()
        compose.onNodeWithText("Effacer").performClick()

        assertThat(confirmed).isTrue()
    }

    @Test
    fun `la bannière d'échec se ferme par sa croix`() {
        var dismissed = false
        compose.setContent {
            MeeshyTheme { CallHistoryEraseFailedBanner(visible = true, onDismiss = { dismissed = true }) }
        }

        compose.onNodeWithText("L'effacement a échoué. Réessayez.").assertIsDisplayed()
        compose.onNodeWithContentDescription("Fermer").performClick()

        assertThat(dismissed).isTrue()
    }
}
