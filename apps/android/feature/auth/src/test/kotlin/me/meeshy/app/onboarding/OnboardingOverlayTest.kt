package me.meeshy.app.onboarding

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.robolectric.RuntimeEnvironment
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.auth.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OnboardingOverlayTest {

    @get:Rule
    val compose = createComposeRule()

    private val context: Context = RuntimeEnvironment.getApplication()

    private fun state(
        card: String = "languages",
        recap: Boolean = false,
        position: Int = 2,
        count: Int = 5,
    ) = OnboardingOverlayState(
        cardKey = card, sessionPoints = 3, isRecap = recap, stepPosition = position, stepCount = count,
    )

    private fun show(state: () -> OnboardingOverlayState, onSkipAll: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                OnboardingOverlay(
                    state = state(), onSkipAll = onSkipAll, reduceMotion = false,
                    announce = {}, onSuccessHaptic = {},
                ) { key -> Text("card:$key") }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `le calque est un volet modal titre`() {
        show({ state() })

        compose.onNodeWithTag(ONBOARDING_OVERLAY_TAG)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, context.getString(R.string.onboarding_overlay_title)))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.IsTraversalGroup, true))
    }

    @Test
    fun `le contenu dessous est retire de l'arbre d'accessibilite tant que le calque est present`() {
        compose.setContent {
            Box(Modifier.hiddenBehindOnboarding(isPresented = true)) { Text("underlay") }
        }

        compose.onNodeWithText("underlay").assertDoesNotExist()
    }

    @Test
    fun `sans calque le contenu dessous reste lisible`() {
        compose.setContent {
            Box(Modifier.hiddenBehindOnboarding(isPresented = false)) { Text("underlay") }
        }

        compose.onNodeWithText("underlay").assertExists()
    }

    @Test
    fun `Tout passer saute le parcours`() {
        var skipped = 0
        show({ state() }, onSkipAll = { skipped++ })

        compose.onNodeWithText(context.getString(R.string.onboarding_skipAll)).performClick()

        assertThat(skipped).isEqualTo(1)
    }

    @Test
    fun `Tout passer est une cible d'au moins 48 dp`() {
        show({ state() })

        val bounds = compose.onNodeWithTag(ONBOARDING_SKIP_ALL_TAG).fetchSemanticsNode().boundsInRoot
        val density = context.resources.displayMetrics.density
        assertThat(bounds.height / density).isAtLeast(48f)
    }

    @Test
    fun `la progression dit la position sur le total`() {
        show({ state(position = 2, count = 5) })

        compose.onNodeWithContentDescription(context.getString(R.string.onboarding_progress_a11y, 2, 5)).assertExists()
    }

    @Test
    fun `sans etape comptee aucune barre de progression`() {
        show({ state(position = 0, count = 0) })

        compose.onNodeWithContentDescription(context.getString(R.string.onboarding_progress_a11y, 0, 0)).assertDoesNotExist()
    }

    @Test
    fun `au recapitulatif ni pastille de session ni Tout passer`() {
        show({ state(recap = true) })

        compose.onNodeWithTag(ONBOARDING_SKIP_ALL_TAG).assertDoesNotExist()
        compose.onNodeWithTag(ONBOARDING_POINTS_CHIP_TAG, useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `la pastille de session montre les points gagnes`() {
        show({ state() })

        compose.onNodeWithContentDescription(
            context.resources.getQuantityString(R.plurals.onboarding_points_a11y, 3, 3),
        ).assertExists()
    }

    @Test
    fun `la carte courante est remplacee quand la carte change`() {
        var current by mutableStateOf("languages")
        show({ state(card = current) })
        compose.onNodeWithText("card:languages").assertExists()

        current = "story"
        compose.waitForIdle()

        compose.onNodeWithText("card:story").assertExists()
        compose.onNodeWithText("card:languages").assertDoesNotExist()
    }

    @Test
    fun `sous animations reduites la carte change aussi`() {
        var current by mutableStateOf("languages")
        compose.setContent {
            MeeshyTheme {
                OnboardingOverlay(
                    state = state(card = current), onSkipAll = {}, reduceMotion = true,
                    announce = {}, onSuccessHaptic = {},
                ) { key -> Text("card:$key") }
            }
        }

        current = "story"
        compose.waitForIdle()

        compose.onNodeWithText("card:story").assertExists()
        compose.onNodeWithText("card:languages").assertDoesNotExist()
    }
}
