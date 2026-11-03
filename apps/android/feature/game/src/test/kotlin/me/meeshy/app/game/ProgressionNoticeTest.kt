package me.meeshy.app.game

import android.content.Context
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import me.meeshy.app.game.progression.ProgressionNoticeView
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.progression.ProgressionNotice
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProgressionNoticeTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun show(notice: ProgressionNotice, onRetry: () -> Unit = {}) {
        compose.setContent { MeeshyTheme { ProgressionNoticeView(notice, onRetry) } }
    }

    @Test
    fun `l etat vide dit que la premiere medaille s allume au premier geste et ne propose pas de reessayer`() {
        show(ProgressionNotice.Empty)

        compose.onNodeWithText(context.getString(R.string.game_progression_empty)).assertExists()
        compose.onAllNodesWithText(context.getString(R.string.game_progression_retry)).assertCountEquals(0)
    }

    @Test
    fun `hors ligne avec instantane et sans instantane disent deux phrases differentes`() {
        show(ProgressionNotice.Offline(hasSnapshot = true))
        compose.onNodeWithText(context.getString(R.string.game_progression_offline)).assertExists()
        compose.onAllNodesWithText(context.getString(R.string.game_progression_retry)).assertCountEquals(0)
    }

    @Test
    fun `hors ligne sans instantane dit qu il n y a rien a montrer`() {
        show(ProgressionNotice.Offline(hasSnapshot = false))

        compose.onNodeWithText(context.getString(R.string.game_progression_offline_empty)).assertExists()
    }

    @Test
    fun `l erreur est une phrase et son bouton relance la lecture`() {
        var retries = 0
        show(ProgressionNotice.Error) { retries++ }

        compose.onNodeWithText(context.getString(R.string.game_progression_load_error)).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_progression_retry)).performClick()

        compose.runOnIdle { check(retries == 1) { "Réessayer n'a pas relancé la lecture" } }
    }
}
