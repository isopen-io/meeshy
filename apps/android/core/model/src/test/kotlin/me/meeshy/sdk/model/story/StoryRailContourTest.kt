package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryRailContourTest {

    private fun contour(
        action: StoryRailEmphasisAction,
        live: StoryRailContour.Live = StoryRailContour.Live(),
        participation: StoryViewerParticipation = StoryViewerParticipation.NONE,
    ) = StoryRailContour.resolve(action, live, participation)

    @Test
    fun `sound and translations only glow while open`() {
        assertThat(contour(StoryRailEmphasisAction.SOUND, live = StoryRailContour.Live(soundOn = true))).isEqualTo(StoryRailContour.LIVE)
        assertThat(contour(StoryRailEmphasisAction.SOUND)).isEqualTo(StoryRailContour.NONE)
        assertThat(contour(StoryRailEmphasisAction.TRANSLATIONS, live = StoryRailContour.Live(languagesOpen = true))).isEqualTo(StoryRailContour.LIVE)
        assertThat(contour(StoryRailEmphasisAction.TRANSLATIONS)).isEqualTo(StoryRailContour.NONE)
    }

    @Test
    fun `an open reaction bar is live and a reaction already sent is participated`() {
        assertThat(contour(StoryRailEmphasisAction.REACT, live = StoryRailContour.Live(reactionBarOpen = true))).isEqualTo(StoryRailContour.LIVE)
        assertThat(contour(StoryRailEmphasisAction.REACT, participation = StoryViewerParticipation(hasReacted = true))).isEqualTo(StoryRailContour.PARTICIPATED)
    }

    @Test
    fun `a gesture already done wins over an open state`() {
        val both = contour(
            StoryRailEmphasisAction.COMMENTS,
            live = StoryRailContour.Live(commentsOpen = true),
            participation = StoryViewerParticipation(hasCommented = true),
        )
        assertThat(both).isEqualTo(StoryRailContour.PARTICIPATED)
        assertThat(contour(StoryRailEmphasisAction.COMMENTS, live = StoryRailContour.Live(commentsOpen = true))).isEqualTo(StoryRailContour.LIVE)
    }

    @Test
    fun `send and repost never glow live, only once done`() {
        val open = StoryRailContour.Live(soundOn = true, reactionBarOpen = true, commentsOpen = true, languagesOpen = true)
        assertThat(contour(StoryRailEmphasisAction.FORWARD, live = open)).isEqualTo(StoryRailContour.NONE)
        assertThat(contour(StoryRailEmphasisAction.REPOST, live = open)).isEqualTo(StoryRailContour.NONE)
        assertThat(contour(StoryRailEmphasisAction.FORWARD, participation = StoryViewerParticipation(hasSent = true))).isEqualTo(StoryRailContour.PARTICIPATED)
        assertThat(contour(StoryRailEmphasisAction.REPOST, participation = StoryViewerParticipation(hasReposted = true))).isEqualTo(StoryRailContour.PARTICIPATED)
    }

    @Test
    fun `session marks project onto the participation`() {
        val participation = StoryViewerParticipation.of(
            setOf(StoryViewerParticipationMark.COMMENTED, StoryViewerParticipationMark.REPOSTED),
            hasReacted = true,
        )
        assertThat(participation).isEqualTo(
            StoryViewerParticipation(hasReacted = true, hasCommented = true, hasSent = false, hasReposted = true),
        )
        assertThat(StoryViewerParticipation.of(emptySet(), hasReacted = false)).isEqualTo(StoryViewerParticipation.NONE)
    }
}
