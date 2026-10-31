package me.meeshy.app.game.progression

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.test.core.app.ApplicationProvider
import me.meeshy.app.game.reveal.RevealCopy
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementMilestoneType
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.engagement.RevealTitle
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Toucher une médaille (étagère de la fiche, ligne d'axe de la page des médailles) ou un défi ouvre SA feuille de
 * précisions, comme iOS (`GameElementSheet`) : nom, état, matière et pourquoi, ce qu'elle suit, la prochaine étoile,
 * les sept paliers, « Comprendre les médailles » et « Fermer ».
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameElementSheetComposeTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun progress(
        counters: Map<EngagementAxisKey, Int> = emptyMap(),
        milestones: List<ApiEngagementProgress.Milestone> = emptyList(),
    ): EngagementProgress = EngagementProgressResolver.resolve(
        ApiEngagementProgress(
            counters = counters.map { (axis, count) -> ApiEngagementProgress.Counter(axis.wire, count) },
            milestones = milestones,
            streak = ApiEngagementProgress.Streak(0, 0),
            level = ApiEngagementProgress.Level(engagementScore = 0),
        ),
    )

    private fun badge(axis: EngagementAxisKey, threshold: Int, at: String) =
        ApiEngagementProgress.Milestone(EngagementMilestoneType.BADGE, "${axis.wire}:$threshold", at)

    private fun show(content: @Composable () -> Unit) = compose.setContent {
        MeeshyTheme { Column(Modifier.verticalScroll(rememberScrollState())) { content() } }
    }

    private val inSheet: SemanticsMatcher get() = hasAnyAncestor(hasTestTag(GAME_DETAIL_TAG))

    private fun sheetText(text: String) = compose.onNode(hasText(text) and inSheet, useUnmergedTree = true)

    private fun sheetSays(text: String) = compose.onNode(hasContentDescription(text, substring = true) and inSheet, useUnmergedTree = true)

    /** Le bouton de la feuille, actionné comme le lecteur d'écran le fait : Robolectric n'injecte pas le toucher dans sa fenêtre. */
    private fun pressInSheet(text: String) {
        compose.onNode(hasClickAction() and hasText(text) and inSheet).performSemanticsAction(SemanticsActions.OnClick)
    }

    private fun assertNoSheet() = compose.onAllNodesWithTag(GAME_DETAIL_TAG).assertCountEquals(0)

    @Test
    fun `a medal of the shelf opens its details, earned at its engraved date, with its seven rungs`() {
        show {
            ConceptRevealPiece(
                ProgressionConcept.Badges,
                progress(
                    counters = mapOf(EngagementAxisKey.TEXT_MESSAGE to 120),
                    milestones = listOf(badge(EngagementAxisKey.TEXT_MESSAGE, 100, "2026-10-03T08:00:00.000Z")),
                ),
                game = null,
                hidden = false,
            )
        }
        assertNoSheet()

        compose.onNodeWithContentDescription(context.getString(R.string.progression_axis_content_text_message), substring = true).performClick()

        sheetText(context.getString(R.string.progression_axis_content_text_message)).assertExists()
        sheetSays(context.getString(R.string.game_detail_earned_on, "October 3, 2026")).assertExists()
        sheetText(context.getString(R.string.game_badge_reason_crossed, context.getString(R.string.game_material_gold), "100", "120")).assertExists()
        sheetText(context.getString(R.string.progression_axis_content_text_message_counts)).assertExists()
        sheetText(context.getString(R.string.game_badge_next, "380", context.getString(R.string.game_material_platinum), "500")).assertExists()
        sheetSays(context.getString(R.string.game_badge_rung_a11y_reached_on, context.getString(R.string.game_material_gold), "100", "October 3, 2026")).assertExists()
        sheetSays(context.getString(R.string.game_badge_rung_a11y_upcoming, context.getString(R.string.game_material_prism), "5,000")).assertExists()
        sheetSays(context.getString(R.string.game_badge_a11y_stars, "4", "7")).assertExists()
        compose.onAllNodesWithTag(GAME_DETAIL_TAG).assertCountEquals(1)
        compose.onAllNodes(hasText(context.getString(R.string.reveal_continue))).assertCountEquals(0)
    }

    @Test
    fun `closing the sheet takes it away`() {
        show { ConceptRevealPiece(ProgressionConcept.Badges, progress(mapOf(EngagementAxisKey.POST to 12)), game = null, hidden = false) }
        compose.onNodeWithContentDescription(context.getString(R.string.progression_axis_content_post), substring = true).performClick()

        pressInSheet(context.getString(R.string.game_detail_close))

        assertNoSheet()
    }

    @Test
    fun `a medal never earned opens from the medals page, locked, aiming at its first star`() {
        show { BadgesSection(progress(), onOpenGuide = {}) }

        compose.onNodeWithContentDescription(context.getString(R.string.progression_axis_social_friendship), substring = true).performScrollTo().performClick()

        val locked = context.getString(R.string.game_detail_locked)
        sheetSays("$locked · ${context.getString(R.string.game_detail_badge_missing, "1")}").assertExists()
        sheetText(context.getString(R.string.game_badge_reason_none)).assertExists()
        sheetText(context.getString(R.string.progression_axis_social_friendship_counts)).assertExists()
    }

    @Test
    fun `a medal dimmed by a strike says what relights it`() {
        show {
            BadgesSection(
                progress(
                    counters = mapOf(EngagementAxisKey.REACTION to 13),
                    milestones = listOf(badge(EngagementAxisKey.REACTION, 50, "2026-09-20T08:00:00.000Z")),
                ),
                onOpenGuide = {},
            )
        }

        compose.onNodeWithContentDescription(context.getString(R.string.progression_axis_tool_reaction), substring = true).performScrollTo().performClick()

        val locked = context.getString(R.string.game_detail_locked)
        sheetSays("$locked · ${context.getString(R.string.game_badge_a11y_imprint, "37")}").assertExists()
        sheetText(context.getString(R.string.game_badge_reason_served, context.getString(R.string.game_material_silver), "50")).assertExists()
    }

    @Test
    fun `understanding the medals closes the sheet and opens the guide`() {
        var opened = 0
        show { BadgesSection(progress(mapOf(EngagementAxisKey.TEXT_MESSAGE to 37)), onOpenGuide = { opened++ }) }
        compose.onNodeWithContentDescription(context.getString(R.string.progression_axis_content_text_message), substring = true).performScrollTo().performClick()

        pressInSheet(context.getString(R.string.game_badge_guide_link))

        compose.runOnIdle { check(opened == 1) { "« Comprendre les médailles » n'a pas ouvert le carnet depuis la feuille" } }
        assertNoSheet()
    }

    @Test
    fun `on a fiche that cannot open the guide the sheet offers no link`() {
        show { ConceptRevealPiece(ProgressionConcept.Badges, progress(mapOf(EngagementAxisKey.POST to 12)), game = null, hidden = false) }

        compose.onNodeWithContentDescription(context.getString(R.string.progression_axis_content_post), substring = true).performClick()

        sheetText(context.getString(R.string.game_detail_close)).assertExists()
        sheetText(context.getString(R.string.game_badge_guide_link)).assertDoesNotExist()
    }

    @Test
    fun `a challenge opens its details, locked, with what a challenge is and its section`() {
        val p = progress()
        val first = p.achievementSections.first().entries.first()
        check(!first.unlocked)
        val res = context.resources
        val locale = res.configuration.locales[0]
        show { ChallengesSection(p) }

        compose.onNode(hasText(RevealCopy.title(res, locale, RevealTitle.Composed(first.family, first.tier))), useUnmergedTree = true)
            .performScrollTo().performClick()

        sheetSays(context.getString(R.string.game_detail_locked)).assertExists()
        sheetText(context.getString(R.string.game_detail_defi_what)).assertExists()
        sheetText(context.getString(R.string.game_detail_defi_how)).assertExists()
        sheetText(RevealCopy.sectionName(res, first.section)).assertExists()
        sheetText(context.getString(R.string.game_badge_guide_link)).assertDoesNotExist()
    }
}
