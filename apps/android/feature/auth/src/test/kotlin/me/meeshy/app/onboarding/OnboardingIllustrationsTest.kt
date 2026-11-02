package me.meeshy.app.onboarding

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
import me.meeshy.app.onboarding.illustrations.ONBOARDING_BELL_TAG
import me.meeshy.app.onboarding.illustrations.ONBOARDING_ENVELOPE_TAG
import me.meeshy.app.onboarding.illustrations.ONBOARDING_FRIENDS_TAG
import me.meeshy.app.onboarding.illustrations.ONBOARDING_GLOBE_TAG
import me.meeshy.app.onboarding.illustrations.ONBOARDING_PRISM_TAG
import me.meeshy.app.onboarding.illustrations.ONBOARDING_STORY_RING_TAG
import me.meeshy.app.onboarding.illustrations.ONBOARDING_TROPHY_TAG
import me.meeshy.app.onboarding.illustrations.OnboardingBellIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingEnvelopeIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingFriendsIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingGlobeIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingPrismIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingStoryRingIllustration
import me.meeshy.app.onboarding.illustrations.OnboardingTrophyIllustration
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OnboardingIllustrationsTest {

    @get:Rule
    val compose = createComposeRule()

    private data class Case(val tag: String, val content: @Composable (Boolean) -> Unit)

    private val cases = listOf(
        Case(ONBOARDING_PRISM_TAG) { reduce -> OnboardingPrismIllustration(reduceMotion = reduce) },
        Case(ONBOARDING_GLOBE_TAG) { reduce -> OnboardingGlobeIllustration(reduceMotion = reduce) },
        Case(ONBOARDING_STORY_RING_TAG) { reduce -> OnboardingStoryRingIllustration("Lina", reduceMotion = reduce) },
        Case(ONBOARDING_FRIENDS_TAG) { _ -> OnboardingFriendsIllustration(listOf("Lina", "Kofi", "Aya", "Zed"), rewardPoints = 7) },
        Case(ONBOARDING_ENVELOPE_TAG) { _ -> OnboardingEnvelopeIllustration() },
        Case(ONBOARDING_BELL_TAG) { reduce -> OnboardingBellIllustration(reduceMotion = reduce) },
        Case(ONBOARDING_TROPHY_TAG) { reduce -> OnboardingTrophyIllustration(reduceMotion = reduce) },
    )

    private fun composeAll(dark: Boolean, fontScale: Float, reduce: Boolean) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            val base = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(base.density, fontScale)) {
                MeeshyTheme(darkTheme = dark) {
                    Column(Modifier.verticalScroll(rememberScrollState())) {
                        cases.forEach { it.content(reduce) }
                    }
                }
            }
        }
        compose.waitForIdle()
        cases.forEach { compose.onNodeWithTag(it.tag, useUnmergedTree = true).assertExists() }
    }

    @Test
    fun `chaque illustration compose en clair`() = composeAll(dark = false, fontScale = 1f, reduce = false)

    @Test
    fun `chaque illustration compose en sombre`() = composeAll(dark = true, fontScale = 1f, reduce = false)

    @Test
    fun `chaque illustration compose avec la police agrandie`() = composeAll(dark = false, fontScale = 2f, reduce = false)

    @Test
    fun `chaque illustration se pose sous animations reduites sans boucle`() {
        composeAll(dark = true, fontScale = 1f, reduce = true)
    }

    @Test
    fun `le prisme reduit montre l'original et sa traduction ensemble`() {
        compose.setContent { MeeshyTheme { OnboardingPrismIllustration(reduceMotion = true) } }
        compose.waitForIdle()
        compose.onNodeWithTag(ONBOARDING_PRISM_TAG, useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `la puce et la jauge composent et se disent au lecteur d'ecran`() {
        compose.setContent {
            MeeshyTheme {
                OnboardingChip(title = "Français", isSelected = true, onClick = {})
                OnboardingLevelGauge(points = 3, threshold = 10)
            }
        }
        compose.waitForIdle()
        compose.onNodeWithTag(ONBOARDING_CHIP_TAG).assertExists()
        compose.onNodeWithTag(ONBOARDING_GAUGE_TAG).assertExists()
    }
}
