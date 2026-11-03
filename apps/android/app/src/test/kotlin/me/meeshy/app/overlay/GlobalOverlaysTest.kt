package me.meeshy.app.overlay

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.navigation.NavHostController
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.chat.GestureRefusalCenter
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.sdk.model.net.NewcomerSlowMode
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], qualifiers = "en")
class GlobalOverlaysTest {

    @get:Rule
    val compose = createComposeRule()

    private val refusals = GestureRefusalCenter()
    private val toasts = FeedbackToastCenter()
    private val overlay = GestureRefusalOverlay(refusals, toasts)

    private fun show() {
        compose.setContent { overlay.Content(NavHostController(ApplicationProvider.getApplicationContext())) }
        compose.waitForIdle()
    }

    @Test
    fun `une limite du jour atteinte leve une banniere d'erreur`() {
        show()

        refusals.report(DailyGestureLimit(DailyGestureLimit.Gesture.COMMENT, null))
        compose.waitForIdle()

        val toast = toasts.current.value
        assertThat(toast?.kind).isEqualTo(FeedbackToastKind.ERROR)
        assertThat(toast?.message).contains("comments allowed today")
    }

    @Test
    fun `le mode lent dit dans combien de secondes on peut ecrire`() {
        show()

        refusals.report(NewcomerSlowMode(retryAfterSeconds = 12))
        compose.waitForIdle()

        assertThat(toasts.current.value?.message).contains("12")
    }

    @Test
    fun `sans refus, aucune banniere ne se leve`() {
        show()

        assertThat(toasts.current.value).isNull()
    }
}
