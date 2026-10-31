package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ReelComposition.MediaKind
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STATUS
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import org.junit.Test

class ComposerHostStateTest {
    private fun open(origin: ComposerOrigin, opening: ComposerFormat? = null) =
        ComposerHostState.open(ComposerIntent(origin, opening))

    private val video = MediaKind("video/mp4", 5_000)
    private val photo = MediaKind("image/jpeg")

    @Test
    fun `each door opens on its own format`() {
        assertThat(open(ComposerOrigin.StoryTray).selectedFormat).isEqualTo(STORY)
        assertThat(open(ComposerOrigin.FeedComposer).selectedFormat).isEqualTo(POST)
        assertThat(open(ComposerOrigin.MoodChip).selectedFormat).isEqualTo(STATUS)
    }

    @Test
    fun `switching the format never loses text, media, scene or audience`() {
        val written = open(ComposerOrigin.FeedComposer)
            .withText("bonjour").withMedia(listOf(video)).withScene(true).withAudience("friends")
        val switched = written.choose(STORY)
        assertThat(switched.selectedFormat).isEqualTo(STORY)
        assertThat(switched.text).isEqualTo("bonjour")
        assertThat(switched.media).containsExactly(video)
        assertThat(switched.hasScene).isTrue()
        assertThat(switched.audience).isEqualTo("friends")
        assertThat(switched.choose(POST).working).isEqualTo(written.working)
    }

    @Test
    fun `a format the door does not offer is refused and the state is unchanged`() {
        val state = open(ComposerOrigin.FeedComposer)
        assertThat(state.choose(REEL)).isEqualTo(state)
        assertThat(state.choose(STATUS)).isEqualTo(state)
    }

    @Test
    fun `reel appears in the offer only while the composition qualifies and the selection falls back when it stops`() {
        val reelling = open(ComposerOrigin.FeedComposer).withMedia(listOf(video)).choose(REEL)
        assertThat(reelling.selectedFormat).isEqualTo(REEL)
        val lost = reelling.withMedia(emptyList())
        assertThat(lost.offeredFormats).doesNotContain(REEL)
        assertThat(lost.selectedFormat).isEqualTo(POST)
    }

    @Test
    fun `mood is offered to a text-only feed composition and withdrawn when media arrives`() {
        val typing = open(ComposerOrigin.FeedComposer).withText("hello")
        assertThat(typing.offeredFormats).contains(STATUS)
        assertThat(typing.withMedia(listOf(photo)).offeredFormats).doesNotContain(STATUS)
    }

    @Test
    fun `the menu keeps the unqualified reel greyed with its reason, in the order of the door`() {
        val menu = open(ComposerOrigin.FeedComposer).verdicts
        assertThat(menu.map { it.format }).containsExactly(POST, STORY, REEL).inOrder()
        assertThat(menu.first { it.format == REEL }.denial).isEqualTo(FormatDenial.REEL_NEEDS_MATERIAL)
        val qualified = open(ComposerOrigin.FeedComposer).withMedia(listOf(video)).verdicts
        assertThat(qualified.all { it.isChoosable }).isTrue()
    }

    @Test
    fun `mood joins the menu with the text and leaves it when media arrives`() {
        val typing = open(ComposerOrigin.FeedComposer).withText("hi").verdicts
        assertThat(typing.map { it.format }).contains(STATUS)
        assertThat(open(ComposerOrigin.FeedComposer).withText("hi").withMedia(listOf(photo)).verdicts.map { it.format })
            .doesNotContain(STATUS)
    }

    @Test
    fun `a door that offers one format has no menu`() {
        assertThat(open(ComposerOrigin.MoodChip).hasFormatMenu).isFalse()
        assertThat(open(ComposerOrigin.FeedComposer).hasFormatMenu).isTrue()
    }

    @Test
    fun `a single qualifying video offers the reel to a post until the author chooses`() {
        val post = open(ComposerOrigin.FeedComposer).withMedia(listOf(video))
        assertThat(post.offersReelForPost).isTrue()
        assertThat(post.choose(POST).offersReelForPost).isFalse()
        assertThat(post.withMedia(listOf(video, photo)).offersReelForPost).isFalse()
    }

    @Test
    fun `an explicit opening wins only when the door offers it`() {
        assertThat(open(ComposerOrigin.StoryTray, POST).selectedFormat).isEqualTo(POST)
        assertThat(open(ComposerOrigin.StoryTray, STATUS).selectedFormat).isEqualTo(STORY)
    }

    @Test
    fun `a bare mood can publish with an emoji alone, a text format needs content`() {
        assertThat(open(ComposerOrigin.MoodChip).withMoodEmoji("😀").offeredFormats).containsExactly(STATUS)
        assertThat(open(ComposerOrigin.FeedComposer).hasContent).isFalse()
        assertThat(open(ComposerOrigin.FeedComposer).withText("x").hasContent).isTrue()
        assertThat(open(ComposerOrigin.FeedComposer).withScene(true).hasContent).isTrue()
    }

    @Test
    fun `switching between story, post and reel changes the format and nothing else, the scene stays where it is`() {
        val scene = open(ComposerOrigin.StoryTray).withText("bonjour").withMedia(listOf(video)).withScene(true).withSceneCount(2)

        val toPost = scene.choose(POST)
        val toReel = toPost.choose(REEL)
        val back = toReel.choose(STORY)

        assertThat(toPost).isEqualTo(scene.copy(chosen = POST))
        assertThat(toReel).isEqualTo(scene.copy(chosen = REEL))
        assertThat(back).isEqualTo(scene.copy(chosen = STORY))
    }

    @Test
    fun `the reel is offered as soon as the scene carries what qualifies one`() {
        val story = open(ComposerOrigin.StoryTray).withScene(true)
        assertThat(story.verdicts.first { it.format == REEL }.isChoosable).isFalse()

        val withVideo = story.withMedia(listOf(video))

        assertThat(withVideo.verdicts.first { it.format == REEL }.isChoosable).isTrue()
        assertThat(withVideo.choose(REEL).selectedFormat).isEqualTo(REEL)
    }
}
