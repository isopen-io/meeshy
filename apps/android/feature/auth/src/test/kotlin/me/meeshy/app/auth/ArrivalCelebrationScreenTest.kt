package me.meeshy.app.auth

import android.content.Context
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.SemanticsMatcher
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.auth.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ArrivalCelebrationScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `l'ecran dit l'adresse confirmee et toucher continue`() {
        var continued = 0
        compose.setContent { MeeshyTheme { ArrivalCelebrationScreen(onContinue = { continued++ }) } }

        compose.onNodeWithText("Address confirmed!").assertExists()
        compose.onNodeWithText(ApplicationProvider.getApplicationContext<Context>().getString(R.string.arrival_celebration_lead)).assertExists()
        compose.onNodeWithText("Address confirmed!").performClick()
        assertThat(continued).isEqualTo(1)
    }

    @Test
    fun `l'action d'accessibilite Continuer passe la fete`() {
        var continued = 0
        compose.setContent { MeeshyTheme { ArrivalCelebrationScreen(onContinue = { continued++ }) } }

        val actions = compose.onNode(SemanticsMatcher.keyIsDefined(SemanticsActions.CustomActions))
            .fetchSemanticsNode().config[SemanticsActions.CustomActions]
        val skip = actions.single { it.label == "Continue" }
        skip.action()
        assertThat(continued).isEqualTo(1)
    }

    @Test
    fun `sous animations reduites l'ecran s'affiche sans feu d'artifice`() {
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides true) {
                MeeshyTheme { ArrivalCelebrationScreen(onContinue = {}) }
            }
        }
        compose.mainClock.advanceTimeBy(ARRIVAL_FADE_MS + 50L)

        compose.onNodeWithText("Address confirmed!").assertExists()
    }
}
