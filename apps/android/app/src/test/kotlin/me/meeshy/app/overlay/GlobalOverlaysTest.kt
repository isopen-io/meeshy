package me.meeshy.app.overlay

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.navigation.NavHostController
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.startup.AppOverlay
import me.meeshy.app.startup.AppOverlayStack
import me.meeshy.sdk.chat.GestureRefusalCenter
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.sdk.model.net.NewcomerSlowMode
import me.meeshy.ui.accessibility.MeeshyA11yId
import me.meeshy.ui.component.feedback.FeedbackToastCenterHost
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

    private class TouchAbsorbingOverlay(private val taps: IntArray) : AppOverlay {
        override val order: Int = 10_000

        @Composable
        override fun Content(navController: NavHostController) {
            Box(Modifier.fillMaxSize().clickable { taps[0] += 1 })
        }
    }

    @Test
    fun `la banniere de refus et son toast restent sous la couche des toasts, touchables au-dessus du plus haut AppOverlay`() {
        val taps = IntArray(1)
        var tapped = 0
        compose.mainClock.autoAdvance = false
        compose.setContent {
            val navController = NavHostController(ApplicationProvider.getApplicationContext())
            AppOverlayStack(listOf(overlay, TouchAbsorbingOverlay(taps)).sortedBy { it.order }, navController)
            FeedbackToastCenterHost(center = toasts)
        }
        compose.mainClock.advanceTimeBy(100)

        refusals.report(DailyGestureLimit(DailyGestureLimit.Gesture.COMMENT, null))
        compose.mainClock.advanceTimeBy(600)
        compose.onNodeWithTag(MeeshyA11yId.TOAST_CONTAINER).assertIsDisplayed()

        toasts.show("Annuler", FeedbackToastKind.INFO) { tapped += 1 }
        compose.mainClock.advanceTimeBy(600)

        compose.onNodeWithTag(MeeshyA11yId.TOAST_CONTAINER).performClick()

        assertThat(tapped).isEqualTo(1)
        assertThat(taps[0]).isEqualTo(0)
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
