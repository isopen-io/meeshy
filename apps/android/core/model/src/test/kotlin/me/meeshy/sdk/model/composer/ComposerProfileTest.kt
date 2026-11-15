package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STATUS
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import org.junit.Test

class ComposerProfileTest {
    private fun profile(o: ComposerOrigin, reel: Boolean = false, mood: Boolean = false) =
        ComposerProfile.of(o, reel, mood)

    @Test
    fun `story tray opens the camera on a story and offers post`() {
        val p = profile(ComposerOrigin.StoryTray)
        assertThat(p.initialFormat).isEqualTo(STORY)
        assertThat(p.offeredFormats).containsExactly(STORY, POST).inOrder()
        assertThat(p.opensWith).isEqualTo(ComposerOpening.CAMERA_READY)
        assertThat(p.allowsCapture).isTrue()
        assertThat(p.routesToLegacy).isNull()
    }

    @Test
    fun `feed composer opens the keyboard on a post and offers mood only when qualified`() {
        assertThat(profile(ComposerOrigin.FeedComposer).offeredFormats).containsExactly(POST, STORY).inOrder()
        assertThat(profile(ComposerOrigin.FeedComposer, reel = true, mood = true).offeredFormats)
            .containsExactly(POST, STORY, REEL, STATUS).inOrder()
        assertThat(profile(ComposerOrigin.FeedComposer).opensWith).isEqualTo(ComposerOpening.KEYBOARD_ON_CONTENT)
    }

    @Test
    fun `mood chip is a status only, without slides, timeline or capture`() {
        val p = profile(ComposerOrigin.MoodChip)
        assertThat(p.initialFormat).isEqualTo(STATUS)
        assertThat(p.offeredFormats).containsExactly(STATUS)
        assertThat(p.showsSlides).isFalse()
        assertThat(p.showsTimeline).isFalse()
        assertThat(p.opensWith).isEqualTo(ComposerOpening.MOOD_GRID)
        assertThat(p.allowsCapture).isFalse()
    }

    @Test
    fun `repost keeps the source format and routes legacy except for story and status`() {
        assertThat(profile(ComposerOrigin.Repost("p", POST)).offeredFormats).containsExactly(POST)
        assertThat(profile(ComposerOrigin.Repost("p", REEL)).offeredFormats).containsExactly(REEL, POST).inOrder()
        assertThat(profile(ComposerOrigin.Repost("p", REEL)).routesToLegacy).isEqualTo(LegacyComposer.REPOST_COMPOSER)
        assertThat(profile(ComposerOrigin.Repost("p", STORY)).routesToLegacy).isNull()
        assertThat(profile(ComposerOrigin.Repost("p", STATUS)).routesToLegacy).isNull()
        assertThat(profile(ComposerOrigin.Repost("p", STORY)).allowsCapture).isFalse()
    }

    @Test
    fun `edit offers the document format and routes legacy except for a story`() {
        assertThat(profile(ComposerOrigin.Edit("p", STORY)).offeredFormats).containsExactly(STORY)
        assertThat(profile(ComposerOrigin.Edit("p", STATUS)).offeredFormats).containsExactly(STATUS)
        assertThat(profile(ComposerOrigin.Edit("p", REEL)).offeredFormats).containsExactly(REEL, POST).inOrder()
        assertThat(profile(ComposerOrigin.Edit("p", POST)).offeredFormats).containsExactly(POST)
        assertThat(profile(ComposerOrigin.Edit("p", POST), reel = true).offeredFormats).containsExactly(POST, REEL).inOrder()
        assertThat(profile(ComposerOrigin.Edit("p", STORY)).routesToLegacy).isNull()
        assertThat(profile(ComposerOrigin.Edit("p", POST)).routesToLegacy).isEqualTo(LegacyComposer.EDIT_POST_SHEET)
        assertThat(profile(ComposerOrigin.Edit("p", POST)).opensWith).isEqualTo(ComposerOpening.RESUME)
    }

    @Test
    fun `draft and share resume on a post and allow capture`() {
        listOf(ComposerOrigin.Draft("d"), ComposerOrigin.Share).forEach {
            val p = profile(it)
            assertThat(p.initialFormat).isEqualTo(POST)
            assertThat(p.offeredFormats).containsExactly(POST, STORY).inOrder()
            assertThat(p.opensWith).isEqualTo(ComposerOpening.RESUME)
            assertThat(p.allowsCapture).isTrue()
        }
    }

    @Test
    fun `conversation and social media seed a story`() {
        listOf(ComposerOrigin.ConversationMedia("m", "a"), ComposerOrigin.SocialMedia("p", null)).forEach {
            val p = profile(it, reel = true)
            assertThat(p.initialFormat).isEqualTo(STORY)
            assertThat(p.offeredFormats).containsExactly(STORY, POST, REEL).inOrder()
            assertThat(p.opensWith).isEqualTo(ComposerOpening.MEDIA_SEEDED)
        }
    }

    @Test
    fun `an explicit opening format wins only when the door offers it`() {
        assertThat(ComposerIntent(ComposerOrigin.Repost("p", STORY), opening = POST).openingFormat()).isEqualTo(POST)
        assertThat(ComposerIntent(ComposerOrigin.MoodChip, opening = POST).openingFormat()).isEqualTo(STATUS)
        assertThat(ComposerIntent(ComposerOrigin.StoryTray).openingFormat()).isEqualTo(STORY)
    }

    @Test
    fun `origin exposes only its own ids`() {
        assertThat(ComposerOrigin.Repost("p", POST).repostedPostId).isEqualTo("p")
        assertThat(ComposerOrigin.Draft("d").resumedDraftId).isEqualTo("d")
        assertThat(ComposerOrigin.Share.repostedPostId).isNull()
        assertThat(ComposerOrigin.Share.resumedDraftId).isNull()
    }

    @Test
    fun `format maps from wire post types and falls back to post`() {
        assertThat(ComposerFormat.from("story")).isEqualTo(STORY)
        assertThat(ComposerFormat.from("REEL")).isEqualTo(REEL)
        assertThat(ComposerFormat.from("STATUS")).isEqualTo(STATUS)
        assertThat(ComposerFormat.from(null as String?)).isEqualTo(POST)
        assertThat(ComposerFormat.from("whatever")).isEqualTo(POST)
        ComposerFormat.entries.forEach { assertThat(ComposerFormat.from(it.postType)).isEqualTo(it) }
    }

    @Test
    fun `repost targeting prefers the original of a chain`() {
        assertThat(RepostTargeting.target("c", " reel ", "r", "o")).isEqualTo(RepostTarget("o", REEL))
        assertThat(RepostTargeting.target("c", "x", "r")).isEqualTo(RepostTarget("r", null))
        assertThat(RepostTargeting.target("c", null)).isEqualTo(RepostTarget("c", null))
    }

    @Test
    fun `switching format keeps text scenes media and audience`() {
        val state = ComposerWorkingState(STORY, "hi", listOf("s1", "s2"), listOf("m1"), "friends")
        val p = profile(ComposerOrigin.StoryTray)
        assertThat(ComposerFormatSwitch.switchTo(state, POST, p)).isEqualTo(state.copy(format = POST))
        assertThat(ComposerFormatSwitch.switchTo(state, STATUS, p)).isEqualTo(state)
    }
}
