package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ReelComposition.MediaKind
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STATUS
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
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

    private fun carried(id: String, alt: String? = null) =
        CarriedMedia(UploadedMedia(id, "u/$id", "image/jpeg", 1L, null, null, null, null), alt)

    @Test
    fun `a post with two photos switched to story carries both onto the scene without re-upload`() {
        val post = open(ComposerOrigin.FeedComposer).withPostDocument(listOf(carried("a", "chat"), carried("b")), StoryVisibility.FRIENDS)
        val story = post.choose(STORY)
        val carry = requireNotNull(story.carry)
        assertThat(carry.target).isEqualTo(ComposerCarry.Side.SCENE)
        assertThat(carry.plan.add.map { it.media.id }).containsExactly("a", "b").inOrder()
        assertThat(carry.plan.alts).containsExactly("a", "chat")
        assertThat(carry.audience).isEqualTo(StoryVisibility.FRIENDS)
        assertThat(carry.plan.leftBehind).isEqualTo(0)
    }

    @Test
    fun `a scene switched to post carries its media, and offline pending ones are counted as left behind`() {
        val scene = open(ComposerOrigin.StoryTray).withSceneDocument(listOf(carried("a")), pending = 2, room = 10, visibility = StoryVisibility.PUBLIC)
        val carry = requireNotNull(scene.choose(POST).carry)
        assertThat(carry.target).isEqualTo(ComposerCarry.Side.POST)
        assertThat(carry.plan.add.map { it.media.id }).containsExactly("a")
        assertThat(carry.plan.leftBehind).isEqualTo(2)
    }

    @Test
    fun `an audience the post cannot express narrows the post to private, never widens it`() {
        val scene = open(ComposerOrigin.StoryTray).withSceneDocument(emptyList(), 0, 10, StoryVisibility.ONLY)
        assertThat(scene.choose(POST).carry?.audience).isEqualTo(StoryVisibility.PRIVATE)
        val community = open(ComposerOrigin.StoryTray).withSceneDocument(emptyList(), 0, 10, StoryVisibility.COMMUNITY)
        assertThat(community.choose(POST).carry?.audience).isEqualTo(StoryVisibility.PRIVATE)
    }

    @Test
    fun `the narrowed audience left untouched on the post never comes back to overwrite the story's list`() {
        val inPost = open(ComposerOrigin.StoryTray).withSceneDocument(emptyList(), 0, 10, StoryVisibility.ONLY)
            .choose(POST).let { it.carryApplied(it.carry!!.token) }
            .withPostDocument(emptyList(), StoryVisibility.PRIVATE)
        assertThat(inPost.choose(STORY).carry).isNull()
        val chosenOnPost = inPost.withPostDocument(emptyList(), StoryVisibility.FRIENDS).choose(STORY)
        assertThat(chosenOnPost.carry?.audience).isEqualTo(StoryVisibility.FRIENDS)
    }

    @Test
    fun `switching back before the arrival took the carry removes nothing from the source`() {
        val story = open(ComposerOrigin.StoryTray).withSceneDocument(listOf(carried("a")), 0, 9, StoryVisibility.PUBLIC)
        val toPost = story.choose(POST)
        assertThat(toPost.carry).isNotNull()
        val back = toPost.choose(STORY)
        assertThat(back.carry).isNull()
        assertThat(back.synced).isEmpty()
        val again = back.choose(POST)
        assertThat(again.carry?.plan?.add?.map { it.media.id }).containsExactly("a")
        assertThat(again.carry?.plan?.remove).isEmpty()
    }

    @Test
    fun `a post media still queued offline never travels and is counted as left behind`() {
        val post = open(ComposerOrigin.FeedComposer).withPostDocument(listOf(carried("a"), carried("cmid_0000")), StoryVisibility.PUBLIC)
        val carry = requireNotNull(post.choose(STORY).carry)
        assertThat(carry.plan.add.map { it.media.id }).containsExactly("a")
        assertThat(carry.plan.leftBehind).isEqualTo(1)
    }

    @Test
    fun `a media removed on the source after a carry is removed on the arrival, a native one is untouched`() {
        val toStory = open(ComposerOrigin.FeedComposer).withPostDocument(listOf(carried("a")), StoryVisibility.PUBLIC).choose(STORY)
            .let { it.carryApplied(it.carry!!.token) }
        val inStory = toStory.withSceneDocument(listOf(carried("a"), carried("own")), 0, 8, StoryVisibility.PUBLIC)
        val trimmedStory = inStory.withSceneDocument(listOf(carried("own")), 0, 9, StoryVisibility.PUBLIC)
        val back = trimmedStory.choose(POST)
        assertThat(requireNotNull(back.carry).plan.remove).containsExactly("a")
        assertThat(back.carry!!.plan.add.map { it.media.id }).containsExactly("own")
    }

    @Test
    fun `a carry is applied once and a text-only switch plans nothing`() {
        val withMedia = open(ComposerOrigin.FeedComposer).withPostDocument(listOf(carried("a")), StoryVisibility.PUBLIC).choose(STORY)
        assertThat(withMedia.carryApplied(withMedia.carry!!.token).carry).isNull()
        assertThat(open(ComposerOrigin.FeedComposer).withText("salut").choose(STORY).carry).isNull()
        assertThat(open(ComposerOrigin.FeedComposer).withMedia(listOf(video)).choose(REEL).carry).isNull()
    }

    @Test
    fun `over capacity the surplus stays behind and is counted`() {
        val many = (1..12).map { carried("m$it") }
        val carry = requireNotNull(open(ComposerOrigin.FeedComposer).withPostDocument(many, StoryVisibility.PUBLIC).choose(STORY).carry)
        assertThat(carry.plan.add).hasSize(10)
        assertThat(carry.plan.leftBehind).isEqualTo(2)
    }

    @Test
    fun `leaving a mood hands over whichever surface last held the media`() {
        val post = open(ComposerOrigin.FeedComposer).withPostDocument(listOf(carried("a")), StoryVisibility.PUBLIC)
        val viaMood = post.copy(chosen = STATUS)
        assertThat(viaMood.choose(STORY).carry?.plan?.add?.map { it.media.id }).containsExactly("a")
    }
}
