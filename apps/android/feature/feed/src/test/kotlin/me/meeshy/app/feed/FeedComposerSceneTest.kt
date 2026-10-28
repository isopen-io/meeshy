package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.StoryBackgroundPalette
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
    fun `tapping the colour already chosen takes the scene away, another colour repaints it`() {
        val painted = FeedComposerDraft().withBackground("0F0C29")

        assertThat(PostSceneLaw.pick(current = painted.background, tapped = "0F0C29")).isNull()
        assertThat(PostSceneLaw.pick(current = painted.background, tapped = "FF2E63")).isEqualTo("FF2E63")
        assertThat(PostSceneLaw.pick(current = null, tapped = "FF2E63")).isEqualTo("FF2E63")
    }

    @Test
    fun `the palette is the shared story palette, never a copy`() {
        assertThat(PostSceneLaw.swatches).isEqualTo(StoryBackgroundPalette.SOLID_COLORS)
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
