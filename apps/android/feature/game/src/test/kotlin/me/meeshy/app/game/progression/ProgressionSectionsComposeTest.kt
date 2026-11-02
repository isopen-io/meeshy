package me.meeshy.app.game.progression

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les pages Médailles et Défis, la suite des paliers sous chaque médaille de l'étagère, et « Comprendre les médailles »
 * qui mène au carnet des règles (iOS `ProgressionSectionPage`, `GameBadgeShelfView`, `GameRulesBadgesSection`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProgressionSectionsComposeTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun progress(counters: Map<EngagementAxisKey, Int> = emptyMap()): EngagementProgress = EngagementProgressResolver.resolve(
        ApiEngagementProgress(
            counters = counters.map { (axis, count) -> ApiEngagementProgress.Counter(axis.wire, count) },
            milestones = emptyList(),
            streak = ApiEngagementProgress.Streak(0, 0),
            level = ApiEngagementProgress.Level(engagementScore = 0),
        ),
    )

    private fun show(content: @Composable () -> Unit) = compose.setContent {
        MeeshyTheme { Column(Modifier.verticalScroll(rememberScrollState())) { content() } }
    }

    /** « Argent, seuil de 50, prochaine étoile : encore 13 » — la prochaine étoile, dite en toutes lettres. */
    private fun nextStar(material: Int, threshold: String, missing: String): String =
        context.getString(R.string.game_badge_rung_a11y_next, context.getString(material), threshold, missing)

    @Test
    fun `each medal of the shelf shows the suite of its rungs, the next star first`() {
        show { ConceptRevealPiece(ProgressionConcept.Badges, progress(mapOf(EngagementAxisKey.TEXT_MESSAGE to 37)), game = null, hidden = false) }

        compose.onNodeWithContentDescription(nextStar(R.string.game_material_silver, "50", "13"), substring = true).assertExists()
        compose.onNodeWithContentDescription(context.getString(R.string.game_badge_rung_a11y_upcoming, context.getString(R.string.game_material_prism), "5,000"), substring = true)
            .assertExists()
    }

    @Test
    fun `the shelf leads to the medals guide when a guide can open, and stays silent otherwise`() {
        var opened = 0
        show {
            ConceptRevealPiece(ProgressionConcept.Badges, progress(mapOf(EngagementAxisKey.POST to 12)), game = null, hidden = false, onOpenBadgesGuide = { opened++ })
        }

        compose.onNodeWithText(context.getString(R.string.game_badge_guide_link)).performScrollTo().performClick()

        compose.runOnIdle { check(opened == 1) { "le lien « Comprendre les médailles » n'a rien ouvert" } }
    }

    @Test
    fun `without a guide to open the shelf shows no link`() {
        show { ConceptRevealPiece(ProgressionConcept.Badges, progress(mapOf(EngagementAxisKey.POST to 12)), game = null, hidden = false) }

        compose.onAllNodesWithText(context.getString(R.string.game_badge_guide_link)).assertCountEquals(0)
    }

    @Test
    fun `the medals page lists every axis with its suite and leads to the guide`() {
        var opened = 0
        show { BadgesSection(progress(mapOf(EngagementAxisKey.TEXT_MESSAGE to 37)), onOpenGuide = { opened++ }) }

        compose.onNodeWithContentDescription(context.getString(R.string.progression_axis_social_friendship), substring = true).assertExists()
        compose.onAllNodesWithContentDescription(nextStar(R.string.game_material_copper, "1", "1"), substring = true).onFirst().assertExists()
        compose.onNodeWithContentDescription(nextStar(R.string.game_material_silver, "50", "13"), substring = true).assertExists()

        compose.onNodeWithText(context.getString(R.string.game_badge_guide_link)).performClick()
        compose.runOnIdle { check(opened == 1) { "le lien de la page des médailles n'a rien ouvert" } }
    }

    @Test
    fun `the guide says what counts for each of the twenty medals and the seven materials`() {
        show { RulesBadgesSection() }

        compose.onNodeWithText(context.getString(R.string.progression_axis_social_friendship_counts)).assertExists()
        compose.onNodeWithText(context.getString(R.string.progression_axis_tool_sticker_counts)).assertExists()
        compose.onNodeWithContentDescription(
            "${context.getString(R.string.game_material_prism)}, ${context.getString(R.string.game_badge_rung_upcoming, "5,000")}",
            substring = true,
        ).assertExists()
    }
}
