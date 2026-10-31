package me.meeshy.app.game.progression

import android.content.Context
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementAchievementKey
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementMilestoneType
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
 * Toucher un badge ou un haut fait sur la fiche de son concept, ou une ligne de la liste des hauts faits, ouvre la
 * révélation en CONSULTATION : la date gravée (ou « à débloquer »), « Fermer », jamais « Voir ma progression ».
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProgressionConsultationTest {

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

    private fun show(concept: ProgressionConcept, progress: EngagementProgress) = compose.setContent {
        MeeshyTheme { ConceptRevealPiece(concept = concept, progress = progress, game = null, hidden = false) }
    }

    /** La carte de la révélation se lit d'un trait : bandeau, titre, explication. */
    private fun assertRevealSays(text: String) {
        compose.onNodeWithContentDescription(text, substring = true).assertExists()
    }

    private fun assertConsultation() {
        compose.onNodeWithText(context.getString(R.string.reveal_close)).assertExists()
        compose.onAllNodesWithText(context.getString(R.string.reveal_continue)).assertCountEquals(0)
    }

    @Test
    fun `touching a medal of the shelf opens its tier as a consultation at its engraved date`() {
        show(
            ProgressionConcept.Badges,
            progress(
                counters = mapOf(EngagementAxisKey.TEXT_MESSAGE to 120),
                milestones = listOf(
                    ApiEngagementProgress.Milestone(EngagementMilestoneType.BADGE, "${EngagementAxisKey.TEXT_MESSAGE.wire}:100", "2026-10-03T08:00:00.000Z"),
                ),
            ),
        )
        compose.onAllNodesWithText(context.getString(R.string.reveal_close)).assertCountEquals(0)

        compose.onNodeWithContentDescription(context.getString(R.string.progression_axis_content_text_message), substring = true).performClick()

        assertConsultation()
        assertRevealSays(context.getString(R.string.progression_obtained, "October 3, 2026"))
    }

    @Test
    fun `touching the latest great deed opens it as a consultation`() {
        show(
            ProgressionConcept.Succes,
            progress(
                milestones = listOf(
                    ApiEngagementProgress.Milestone(EngagementMilestoneType.ACHIEVEMENT, EngagementAchievementKey.FIRST_VOICE.wire, "2026-10-03T08:00:00.000Z"),
                ),
            ),
        )

        compose.onNodeWithText(context.getString(R.string.progression_hero_last), ignoreCase = true).performClick()

        assertConsultation()
        assertRevealSays(context.getString(R.string.progression_obtained, "October 3, 2026"))
    }

    @Test
    fun `touching the next great deed opens it locked, with what it asks`() {
        show(ProgressionConcept.Succes, progress())

        compose.onNodeWithText(context.getString(R.string.progression_hero_next), ignoreCase = true).performClick()

        assertConsultation()
        assertRevealSays(context.getString(R.string.reveal_badge_locked))
    }

    @Test
    fun `touching a row of the great deeds list opens that great deed as a consultation`() {
        compose.setContent {
            MeeshyTheme { AchievementList(progress = progress(), game = null, hidden = false) }
        }

        compose.onNodeWithText(context.getString(R.string.progression_achievement_editor_title)).performClick()

        assertConsultation()
        assertRevealSays(context.getString(R.string.reveal_badge_locked))
    }
}
