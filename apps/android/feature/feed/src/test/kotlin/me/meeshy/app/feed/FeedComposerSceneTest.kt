package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryBackgroundPalette
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

class FeedComposerSceneTest {

    @Test
    fun `a post with no background has no scene, choosing one makes the scene appear`() {
        val bare = FeedComposerDraft(text = "bonjour")

        assertThat(bare.showsScene).isFalse()
        assertThat(bare.withBackground("302B63").showsScene).isTrue()
    }

    @Test
    fun `the background is kept as the wire hex, uppercase and without the hash`() {
        assertThat(FeedComposerDraft().withBackground("#ff2e63").background).isEqualTo("FF2E63")
    }

    @Test
    fun `a blank or malformed colour never births a scene`() {
        assertThat(FeedComposerDraft().withBackground("").showsScene).isFalse()
        assertThat(FeedComposerDraft().withBackground("zzz").showsScene).isFalse()
    }

    @Test
    fun `choosing the colour already painted keeps the scene, it is only taken away by the menu`() {
        val painted = FeedComposerDraft().withBackground("0F0C29")

        assertThat(painted.withBackground("0F0C29")).isEqualTo(painted)
        assertThat(painted.withBackground("FF2E63").background).isEqualTo("FF2E63")
        assertThat(painted.withBackground(null).showsScene).isFalse()
    }

    @Test
    fun `the overflow offers nothing on a blank composer, so the button does not exist`() {
        assertThat(PostOverflowLaw.entries(FeedComposerDraft())).isEmpty()
    }

    @Test
    fun `remove the background is offered only while there is one, and clear all closes the list`() {
        assertThat(PostOverflowLaw.entries(FeedComposerDraft().withBackground("0F0C29")))
            .containsExactly(PostOverflowEntry.REMOVE_BACKGROUND, PostOverflowEntry.CLEAR_ALL).inOrder()
        assertThat(PostOverflowLaw.entries(FeedComposerDraft(text = "salut")))
            .containsExactly(PostOverflowEntry.CLEAR_ALL)
    }

    @Test
    fun `a place alone is something to clear, whitespace alone is not`() {
        assertThat(PostOverflowLaw.entries(FeedComposerDraft(text = "  \n "))).isEmpty()
        assertThat(PostOverflowLaw.entries(FeedComposerDraft().withLocation(SharedPlace(latitude = 1.0, longitude = 2.0))))
            .containsExactly(PostOverflowEntry.CLEAR_ALL)
    }

    @Test
    fun `remove the background takes the scene away and leaves the words`() {
        val draft = FeedComposerDraft(text = "la vue").withBackground("08D9D6")

        val after = PostOverflowLaw.perform(PostOverflowEntry.REMOVE_BACKGROUND, draft)

        assertThat(after.showsScene).isFalse()
        assertThat(after.text).isEqualTo("la vue")
    }

    @Test
    fun `clear all empties the document but keeps the audience, the language and the chosen format`() {
        val draft = FeedComposerDraft(text = "x", visibility = FeedPostVisibility.FRIENDS, language = "es", forcePlainPost = true)
            .withBackground("08D9D6")
            .withLocation(SharedPlace(latitude = 1.0, longitude = 2.0))

        val after = PostOverflowLaw.perform(PostOverflowEntry.CLEAR_ALL, draft)

        assertThat(after).isEqualTo(FeedComposerDraft(visibility = FeedPostVisibility.FRIENDS, language = "es", forcePlainPost = true))
    }

    @Test
    fun `after clear all, a video posed under the Post format still publishes a post, not a reel`() {
        val governedAsPost = FeedComposerDraft(text = "x").withForcePlainPost(true)

        val after = PostOverflowLaw.perform(PostOverflowEntry.CLEAR_ALL, governedAsPost)
            .withMedia(listOf(UploadedMedia(id = "v", url = "https://cdn/v.mp4", mimeType = "video/mp4", fileSize = 1, width = 1080, height = 1920, durationMs = 8_000, thumbnailUrl = null)))

        assertThat(after.postType).isEqualTo(PostType.POST)
    }

    @Test
    fun `the palette is the shared story palette, never a copy`() {
        assertThat(PostSceneLaw.swatches).isEqualTo(StoryBackgroundPalette.SOLID_COLORS)
    }

    @Test
    fun `each swatch is announced by its rank in the palette, never by the group name`() {
        assertThat(PostSceneLaw.swatchRank(index = 0)).isEqualTo(1 to PostSceneLaw.swatches.size)
        assertThat(PostSceneLaw.swatchRank(index = 2)).isEqualTo(3 to 17)
    }

    @Test
    fun `under a scene the text is a compact description, without one it is the long body`() {
        assertThat(PostSceneLaw.contentMinLines(showsScene = true)).isLessThan(PostSceneLaw.contentMinLines(showsScene = false))
        assertThat(PostSceneLaw.contentMinLines(showsScene = false)).isEqualTo(6)
    }

    @Test
    fun `the text under a scene stays the post content and the background travels with the publish`() {
        val request = FeedComposerDraft(text = "  la vue ").withBackground("08D9D6").publishRequest()!!

        assertThat(request.content).isEqualTo("la vue")
        assertThat(request.background).isEqualTo("08D9D6")
        assertThat(FeedComposerDraft(text = "x").publishRequest()!!.background).isNull()
    }

    @Test
    fun `the background survives the durable draft`() {
        val draft = FeedComposerDraft(text = "x").withBackground("9B59B6")

        assertThat(draft.toSnapshot(nowMillis = 1L).toComposerDraft()).isEqualTo(draft)
    }

    @Test
    fun `the keyboard debt focuses the field, raises the keyboard and is paid once`() = runBlocking {
        val log = mutableListOf<String>()

        payKeyboardDebt(
            requestFocus = { log += "focus"; true },
            nextFrame = { log += "frame" },
            showKeyboard = { log += "keyboard" },
            onPaid = { log += "paid" },
        )

        assertThat(log).containsExactly("focus", "keyboard", "paid").inOrder()
    }

    @Test
    fun `a field attached a frame late is retried frame by frame before the keyboard is asked for`() = runBlocking {
        val log = mutableListOf<String>()
        var attempts = 0

        payKeyboardDebt(
            requestFocus = { log += "focus"; ++attempts == 3 },
            nextFrame = { log += "frame" },
            showKeyboard = { log += "keyboard" },
            onPaid = { log += "paid" },
        )

        assertThat(log).containsExactly("focus", "frame", "focus", "frame", "focus", "keyboard", "paid").inOrder()
    }

    @Test
    fun `a field that never attaches raises no keyboard but the debt is still settled`() = runBlocking {
        val log = mutableListOf<String>()

        payKeyboardDebt(
            requestFocus = { log += "focus"; false },
            nextFrame = { },
            showKeyboard = { log += "keyboard" },
            onPaid = { log += "paid" },
        )

        assertThat(log).containsExactly("focus", "focus", "focus", "paid").inOrder()
    }
}
