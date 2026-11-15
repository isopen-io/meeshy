package me.meeshy.app.notifications

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.clickable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NotificationBannerGestureTest {

    @get:Rule
    val compose = createComposeRule()

    private class Log {
        val lifts = mutableListOf<Float>()
        var dismissed = 0
        var previewed = 0
        var tapped = 0
    }

    private fun show(log: Log) {
        compose.setContent {
            Box(
                Modifier
                    .testTag("card")
                    .fillMaxWidth()
                    .height(120.dp)
                    .bannerGestures(
                        onLift = { log.lifts += it },
                        onDismiss = { log.dismissed++ },
                        onPreview = { log.previewed++ },
                    )
                    .clickable { log.tapped++ },
            )
        }
    }

    @Test
    fun `un balayage vers le haut suit le doigt puis ferme la banniere`() {
        val log = Log()
        show(log)

        compose.onNodeWithTag("card").performTouchInput { swipeUp(startY = bottom, endY = top, durationMillis = 200) }
        compose.waitForIdle()

        assertThat(log.dismissed).isEqualTo(1)
        assertThat(log.previewed).isEqualTo(0)
        assertThat(log.tapped).isEqualTo(0)
        assertThat(log.lifts.minOrNull()).isLessThan(0f)
        assertThat(log.lifts.none { it > 0f }).isTrue()
    }

    @Test
    fun `un tirage vers le bas ouvre l'apercu sans fermer ni descendre la carte`() {
        val log = Log()
        show(log)

        compose.onNodeWithTag("card").performTouchInput { swipeDown(startY = top, endY = bottom, durationMillis = 200) }
        compose.waitForIdle()

        assertThat(log.previewed).isEqualTo(1)
        assertThat(log.dismissed).isEqualTo(0)
        assertThat(log.lifts.none { it > 0f }).isTrue()
    }

    @Test
    fun `un appui long de 350 ms ouvre l'apercu et n'est pas un tap`() {
        val log = Log()
        show(log)

        compose.onNodeWithTag("card").performTouchInput { longClick(durationMillis = 700) }
        compose.waitForIdle()

        assertThat(log.previewed).isEqualTo(1)
        assertThat(log.tapped).isEqualTo(0)
    }

    @Test
    fun `un tap simple reste un tap et ne declenche aucun geste`() {
        val log = Log()
        show(log)

        compose.onNodeWithTag("card").performClick()
        compose.waitForIdle()

        assertThat(log.tapped).isEqualTo(1)
        assertThat(log.dismissed).isEqualTo(0)
        assertThat(log.previewed).isEqualTo(0)
    }
}
