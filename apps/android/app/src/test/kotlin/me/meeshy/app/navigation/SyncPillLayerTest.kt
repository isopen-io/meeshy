package me.meeshy.app.navigation

import androidx.compose.material3.Text
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #18387 — la pastille de synchronisation ne disparaît plus d'un coup quand une bannière arrive ou qu'on passe aux
 * stories : son hôte reste composé pendant le fondu de sortie, sans que TalkBack lise une pastille qui s'en va.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en")
class SyncPillLayerTest {

    @get:Rule val compose = createComposeRule()

    private fun hidesWhileComposed(reduce: Boolean, during: Long) {
        var visible by mutableStateOf(true)
        var composed = false
        compose.setContent {
            SyncPillLayer(visible = visible, reduce = reduce) {
                DisposableEffect(Unit) {
                    composed = true
                    onDispose { composed = false }
                }
                Text("pastille")
            }
        }
        compose.onNodeWithText("pastille").assertExists()

        compose.mainClock.autoAdvance = false
        visible = false
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeBy(during)

        assertThat(composed).isTrue()
        compose.onNodeWithText("pastille").assertDoesNotExist()

        compose.mainClock.advanceTimeBy(2_000)
        assertThat(composed).isFalse()
    }

    @Test
    fun `l'hote reste compose pendant le fondu de sortie`() = hidesWhileComposed(reduce = false, during = 64)

    @Test
    fun `sous reduction l'hote reste compose pendant le fondu court`() = hidesWhileComposed(reduce = true, during = 48)
}
