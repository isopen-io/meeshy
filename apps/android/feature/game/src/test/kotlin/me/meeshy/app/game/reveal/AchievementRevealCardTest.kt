package me.meeshy.app.game.reveal

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.game.engagement.RevealOccasion
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * LA CARTE DE RÉVÉLATION (iOS `AchievementRevealView`) : la célébration offre « Voir ma progression » en premier et
 * laisse la fermeture en retrait ; la consultation ne refête rien et n'offre que la fermeture ; sous « réduire les
 * animations » la carte est posée à son état final, boutons compris.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr")
class AchievementRevealCardTest {

    @get:Rule val compose = createComposeRule()

    private val streak = EngagementReveal.Streak(23)

    private fun show(
        occasion: RevealOccasion,
        onContinue: () -> Unit = {},
        onSeeProgression: (() -> Unit)? = null,
    ) = compose.setContent {
        CompositionLocalProvider(LocalReduceMotion provides true) {
            MeeshyTheme {
                AchievementRevealScreen(
                    reveal = streak,
                    onContinue = onContinue,
                    occasion = occasion,
                    onSeeProgression = onSeeProgression,
                )
            }
        }
    }

    @Test
    fun `a celebration offers the progression first and keeps the dismissal as an exit`() {
        var progression = 0
        var closed = 0
        show(RevealOccasion.Celebration, onContinue = { closed++ }, onSeeProgression = { progression++ })

        compose.onNodeWithText("Voir ma progression").assertIsDisplayed().performClick()
        compose.onNodeWithText("OK").assertIsDisplayed().performClick()

        assertThat(progression).isEqualTo(1)
        assertThat(closed).isEqualTo(1)
    }

    @Test
    fun `a consultation celebrates nothing and only offers to close`() {
        var closed = 0
        show(RevealOccasion.Consultation(unlocked = true, reachedAt = null), onContinue = { closed++ }, onSeeProgression = { error("jamais") })

        compose.onNodeWithText("Fermer").assertIsDisplayed().performClick()

        assertThat(closed).isEqualTo(1)
        assertThat(count("Voir ma progression")).isEqualTo(0)
    }

    private fun count(text: String): Int = compose.onAllNodesWithText(text).fetchSemanticsNodes().size
}
