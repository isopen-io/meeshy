package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.story.StoryRailContour
import me.meeshy.sdk.model.story.StoryViewerParticipation
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le rail prend la densité qui tient (#14717) : espacement normal, puis resserré, puis défilement ; chaque bouton ≥ 48 dp. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h900dp")
class StoryActionRailComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val viewerPlan = StoryRailPlan.resolve(
        isOwnStory = false,
        hasTranslatableContent = true,
        canReply = true,
        canCompose = true,
        commentCount = 3,
        hasAudibleSound = true,
    )

    private fun show(
        height: Dp,
        plan: StoryRailPlan = viewerPlan,
        emphasis: StoryRailEmphasis = StoryRailEmphasis(),
        taps: StoryRailTaps = StoryRailTaps(),
    ) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = height)) {
                    StoryActionRail(
                        plan = plan,
                        reactionCount = 0,
                        hasReacted = false,
                        languageBadgeCode = null,
                        heartBouncePulse = 0,
                        onTapHeart = {},
                        onTapLanguage = {},
                        onTapReply = {},
                        onScrubEvent = {},
                        onHeartBounds = {},
                        onLanguageBounds = {},
                        emphasis = emphasis,
                        taps = taps,
                    )
                }
            }
        }
    }

    private fun gapBetweenReactAndReply(): Dp {
        val react = compose.onNodeWithContentDescription("React").getUnclippedBoundsInRoot()
        val reply = compose.onNodeWithContentDescription("Reply").getUnclippedBoundsInRoot()
        return reply.top - react.bottom
    }

    @Test
    fun `a tall screen keeps the normal spacing and every button is at least 48 dp`() {
        show(900.dp)
        assertThat(gapBetweenReactAndReply().value).isAtLeast(12f)
        listOf("Sound", "React", "Reply", "Send", "Repost", "Comments", "Translations").forEach { label ->
            val bounds = compose.onNodeWithContentDescription(label).getUnclippedBoundsInRoot()
            assertThat(bounds.height.value).isAtLeast(48f)
            assertThat(bounds.width.value).isAtLeast(48f)
        }
    }

    @Test
    fun `a short screen tightens the spacing before it scrolls`() {
        show(580.dp)
        assertThat(gapBetweenReactAndReply().value).isLessThan(12f)
    }

    @Test
    fun `a very short screen scrolls, the last button stays out of the box instead of being squeezed`() {
        show(300.dp)
        val last = compose.onNodeWithContentDescription("Translations").getUnclippedBoundsInRoot()
        assertThat(last.bottom.value).isGreaterThan(300f)
        assertThat(last.height.value).isAtLeast(48f)
    }

    @Test
    fun `the plan decides which buttons exist, none is invented`() {
        show(900.dp, plan = StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = false))
        val nodes = compose.onAllNodesWithContentDescription("React").fetchSemanticsNodes()
        assertThat(nodes).isEmpty()
        assertThat(compose.onAllNodesWithContentDescription("Views").fetchSemanticsNodes()).hasSize(1)
        assertThat(compose.onAllNodesWithContentDescription("Save").fetchSemanticsNodes()).hasSize(1)
    }

    @Test
    fun `a button announces its label and its state`() {
        show(900.dp, emphasis = StoryRailEmphasis(participation = StoryViewerParticipation(hasReacted = true)))
        val node = compose.onNodeWithContentDescription("React").fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("Active")
    }

    @Test
    fun `the contour tint follows the contour`() {
        val accent = androidx.compose.ui.graphics.Color.Red
        assertThat(storyRailContourColor(StoryRailContour.NONE, accent)).isNull()
        assertThat(storyRailContourColor(StoryRailContour.PARTICIPATED, accent)).isEqualTo(accent)
        assertThat(storyRailContourColor(StoryRailContour.LIVE, accent)).isNotEqualTo(accent)
    }

    @Test
    fun `the wand on the rail images the story, for the author as for a viewer (#16334)`() {
        var imaged = 0
        show(900.dp, taps = StoryRailTaps(onImager = { imaged++ }))

        compose.onNodeWithContentDescription("Picture it").performClick()

        assertThat(imaged).isEqualTo(1)
        assertThat(StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = false).showsImager).isTrue()
        assertThat(viewerPlan.showsImager).isTrue()
    }

    @Test
    fun `compose keeps its own entry, the wand no longer opens it (#16334)`() {
        var composed = 0
        var imaged = 0
        show(900.dp, taps = StoryRailTaps(onCompose = { composed++ }, onImager = { imaged++ }))

        compose.onNodeWithContentDescription("Compose").performClick()

        assertThat(composed to imaged).isEqualTo(1 to 0)
    }
}
