package me.meeshy.app.game.progression

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.isDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.rules.GameRulesBook
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le carnet « Comment ça marche » entier, à l'iso d'iOS `GameRulesPage` : règles, glossaire, médailles, étapes. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameRulesScreenComposeTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun show(focused: GameRulesSection?) {
        compose.setContent { MeeshyTheme { GameRulesScreen(onBack = {}, focused = focused) } }
        compose.waitForIdle()
    }

    @Test
    fun `opened at the top, the book starts with Mee and Meo and the first rule`() {
        show(focused = null)
        compose.onNodeWithText(context.getString(R.string.game_rules_intro)).assertIsDisplayed()
        compose.onNodeWithText(context.getString(R.string.game_rules_1_title)).assertIsDisplayed()
        compose.onNodeWithTag(RULES_BADGES_TAG).assertIsNotDisplayed()
    }

    @Test
    fun `the book carries every rule, every concept, the medals and every step, in iOS order`() {
        show(focused = null)
        GameRulesBook.ruleIndices.forEach { compose.onNodeWithTag(rulesRuleTag(it)).assertExists() }
        GameRulesBook.glossary.forEach { compose.onNodeWithTag(rulesConceptTag(it)).assertExists() }
        GameRulesBook.onboardingSteps.forEach { compose.onNodeWithTag(rulesStepTag(it.key)).assertExists() }
        compose.onNodeWithText(context.getString(R.string.game_rules_concept_chest_body)).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_guide_step_first_points_means)).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_guide_step_of, "7", "7").uppercase()).assertExists()
        val tops = listOf(RULES_RULES_TAG, RULES_CONCEPTS_TAG, RULES_BADGES_TAG, RULES_STEPS_TAG)
            .map { compose.onNodeWithTag(it).getUnclippedBoundsInRoot().top.value }
        assertThat(tops).isInStrictOrder()
    }

    @Test
    fun `opened at the medals, the book scrolls to its medals section`() {
        show(focused = GameRulesSection.Badges)
        val medals = compose.onNodeWithText(context.getString(R.string.game_rules_badges_intro))
        compose.waitUntil(timeoutMillis = 5_000) { medals.isDisplayed() }
        medals.assertIsDisplayed()
        compose.onNodeWithText(context.getString(R.string.game_rules_1_title)).assertIsNotDisplayed()
    }
}
