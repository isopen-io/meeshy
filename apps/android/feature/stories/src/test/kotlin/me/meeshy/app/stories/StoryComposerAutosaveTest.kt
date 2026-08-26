package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryFilter
import org.junit.Test

/**
 * [StoryComposerAutosave] — the pure decision layer that turns a live composer deck into
 * a save / clear / no-op against the durable draft store, and restores a stored draft
 * only into a pristine composer. The rich-content fidelity gate (a draft carrying
 * elements/stickers/filter/background/duration/transform is not yet persistable) is the
 * load-bearing rule: it keeps a restore from ever being lossy.
 */
class StoryComposerAutosaveTest {

    private val now = "2026-08-26T12:00:00Z"

    private fun blankDeck() = StorySlideDeck.single("s1")
    private fun textDeck(text: String = "hello") = StorySlideDeck.single("s1").updateSelectedText(text)

    // ---- resolve: Save ----

    @Test
    fun `a simple text draft resolves to Save carrying the caption and audience`() {
        val action = StoryComposerAutosave.resolve(
            deck = textDeck("bonjour"),
            visibility = StoryVisibility.FRIENDS,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
        val snap = (action as StoryDraftPersist.Save).snapshot
        assertThat(snap.slides.single().text).isEqualTo("bonjour")
        assertThat(snap.visibility).isEqualTo("FRIENDS")
        assertThat(snap.selectedId).isEqualTo("s1")
    }

    @Test
    fun `a media-only draft resolves to Save`() {
        val action = StoryComposerAutosave.resolve(
            deck = blankDeck().addMediaToSelected("m1"),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
    }

    @Test
    fun `a blank repost link never rides the saved snapshot`() {
        val action = StoryComposerAutosave.resolve(
            deck = textDeck("x"),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = "   ",
            nowIso = now,
            previous = null,
        )

        assertThat((action as StoryDraftPersist.Save).snapshot.repostOfId).isNull()
    }

    // ---- resolve: None ----

    @Test
    fun `an unchanged simple draft resolves to None`() {
        val previous = textDeck("same").toDraftSnapshot(StoryVisibility.PUBLIC, null, "earlier")
        val action = StoryComposerAutosave.resolve(
            deck = textDeck("same"),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = previous,
        )

        assertThat(action).isEqualTo(StoryDraftPersist.None)
    }

    @Test
    fun `an empty composer over no stored draft resolves to None`() {
        val action = StoryComposerAutosave.resolve(
            deck = blankDeck(),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isEqualTo(StoryDraftPersist.None)
    }

    // ---- resolve: Clear ----

    @Test
    fun `an emptied composer over a stored draft resolves to Clear`() {
        val previous = textDeck("was here").toDraftSnapshot(StoryVisibility.PUBLIC, null, "earlier")
        val action = StoryComposerAutosave.resolve(
            deck = blankDeck(),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = previous,
        )

        assertThat(action).isEqualTo(StoryDraftPersist.Clear)
    }

    // ---- resolve: rich-content fidelity gate ----

    @Test
    fun `a draft with a text element is not persisted even with a caption`() {
        val deck = textDeck("caption")
            .addTextElementToSelected(StoryTextElement(id = "e1", text = "on canvas"))

        val action = StoryComposerAutosave.resolve(
            deck = deck,
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isEqualTo(StoryDraftPersist.None)
    }

    @Test
    fun `a draft that gained rich content purges its stale stored draft`() {
        val previous = textDeck("simple before").toDraftSnapshot(StoryVisibility.PUBLIC, null, "earlier")
        val deck = textDeck("simple before").setSelectedFilter(StoryFilter.VINTAGE)

        val action = StoryComposerAutosave.resolve(
            deck = deck,
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = previous,
        )

        assertThat(action).isEqualTo(StoryDraftPersist.Clear)
    }

    // ---- deckHasRichContent: each arm ----

    @Test
    fun `deckHasRichContent is false for a bare text plus media deck`() {
        assertThat(
            StoryComposerAutosave.deckHasRichContent(textDeck("t").addMediaToSelected("m1")),
        ).isFalse()
    }

    @Test
    fun `deckHasRichContent is true for a sticker`() {
        val deck = blankDeck().addStickerToSelected(StoryStickerElement(id = "k1", emoji = "🎉"))
        assertThat(StoryComposerAutosave.deckHasRichContent(deck)).isTrue()
    }

    @Test
    fun `deckHasRichContent is true for a background`() {
        val deck = blankDeck().setSelectedBackground(me.meeshy.sdk.model.StoryBackgroundValue.Hex("FF0000"))
        assertThat(StoryComposerAutosave.deckHasRichContent(deck)).isTrue()
    }

    @Test
    fun `deckHasRichContent is true for a pinned duration`() {
        val deck = blankDeck().setSelectedDuration(12.0)
        assertThat(StoryComposerAutosave.deckHasRichContent(deck)).isTrue()
    }

    @Test
    fun `deckHasRichContent is true for a non-identity canvas transform`() {
        val deck = blankDeck().updateSelectedTransform(
            StoryCanvasTransform(scale = 2f).clampedTo(1000f, 1000f),
        )
        assertThat(StoryComposerAutosave.deckHasRichContent(deck)).isTrue()
    }

    // ---- deckIsPristine ----

    @Test
    fun `a fresh single blank slide is pristine`() {
        assertThat(StoryComposerAutosave.deckIsPristine(blankDeck())).isTrue()
    }

    @Test
    fun `a deck with typed text is not pristine`() {
        assertThat(StoryComposerAutosave.deckIsPristine(textDeck("typed"))).isFalse()
    }

    @Test
    fun `a two-slide deck is not pristine`() {
        assertThat(StoryComposerAutosave.deckIsPristine(blankDeck().addSlide("s2"))).isFalse()
    }

    // ---- restore ----

    @Test
    fun `restore returns the stored draft into a pristine composer`() {
        val stored = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "resume")),
            selectedId = "s1",
        )
        assertThat(StoryComposerAutosave.restore(stored, deckIsPristine = true)).isEqualTo(stored)
    }

    @Test
    fun `restore returns null when the composer is not pristine`() {
        val stored = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "resume")),
            selectedId = "s1",
        )
        assertThat(StoryComposerAutosave.restore(stored, deckIsPristine = false)).isNull()
    }

    @Test
    fun `restore returns null for a null or content-empty stored draft`() {
        assertThat(StoryComposerAutosave.restore(null, deckIsPristine = true)).isNull()
        val empty = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "  ")),
            selectedId = "s1",
        )
        assertThat(StoryComposerAutosave.restore(empty, deckIsPristine = true)).isNull()
    }

    // ---- toDraftSnapshot / toDeck round-trip ----

    @Test
    fun `toDraftSnapshot then toDeck round-trips slides, media and selection`() {
        val deck = StorySlideDeck.single("s1")
            .updateSelectedText("one")
            .addMediaToSelected("m1")
            .addSlide("s2")
            .updateSelectedText("two")

        val rebuilt = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now).toDeck()

        assertThat(rebuilt).isNotNull()
        assertThat(rebuilt!!.slides.map { it.text }).containsExactly("one", "two").inOrder()
        assertThat(rebuilt.slides.first().mediaIds).containsExactly("m1")
        assertThat(rebuilt.selectedId).isEqualTo("s2")
    }

    @Test
    fun `toDeck returns null for a structurally broken snapshot`() {
        val broken = StoryComposerDraftSnapshot(slides = emptyList(), selectedId = "s1")
        assertThat(broken.toDeck()).isNull()
    }
}
