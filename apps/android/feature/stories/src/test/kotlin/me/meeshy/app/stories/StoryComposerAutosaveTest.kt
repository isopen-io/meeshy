package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftFilterSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryDraftTextElementSnapshot
import me.meeshy.sdk.model.StoryDraftTransformSnapshot
import me.meeshy.sdk.model.StoryFilter
import org.junit.Test

/**
 * [StoryComposerAutosave] — the pure decision layer that turns a live composer deck into
 * a save / clear / no-op against the durable draft store, and restores a stored draft
 * only into a pristine composer. Every dimension of a composer slide — caption, media,
 * canvas pan/zoom transform, photo filter, pinned duration, colour/media background,
 * on-canvas text elements and stickers — round-trips through the snapshot, so there is no
 * longer any rich content that forces a draft to be treated as not-yet-persistable: the
 * decision turns purely on whether the projected snapshot is worth restoring and changed.
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
    fun `a draft with a text element resolves to Save carrying the caption and the element`() {
        val deck = textDeck("caption")
            .addTextElementToSelected(StoryTextElement(id = "e1", text = "on canvas"))

        val action = StoryComposerAutosave.resolve(
            deck = deck,
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
        val snap = (action as StoryDraftPersist.Save).snapshot
        assertThat(snap.slides.single().text).isEqualTo("caption")
        assertThat(snap.slides.single().elements.single().text).isEqualTo("on canvas")
    }

    @Test
    fun `a draft that gained a sticker now saves it over the stale stored draft`() {
        val previous = textDeck("simple before").toDraftSnapshot(StoryVisibility.PUBLIC, null, "earlier")
        val deck = textDeck("simple before")
            .addStickerToSelected(StoryStickerElement(id = "k1", emoji = "🎉"))

        val action = StoryComposerAutosave.resolve(
            deck = deck,
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = previous,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
        val snap = (action as StoryDraftPersist.Save).snapshot
        assertThat(snap.slides.single().stickers.single().emoji).isEqualTo("🎉")
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

    @Test
    fun `a single blank slide with a non-identity transform is not pristine`() {
        val panned = blankDeck().updateSelectedTransform(
            StoryCanvasTransform(scale = 2f).clampedTo(1000f, 1000f),
        )
        assertThat(StoryComposerAutosave.deckIsPristine(panned)).isFalse()
    }

    @Test
    fun `a single blank slide with a pinned duration is not pristine`() {
        assertThat(StoryComposerAutosave.deckIsPristine(blankDeck().setSelectedDuration(12.0))).isFalse()
    }

    @Test
    fun `a single blank slide with a colour background is not pristine`() {
        val backdropped = blankDeck().setSelectedBackground(StoryBackgroundValue.Hex("2ECC71"))
        assertThat(StoryComposerAutosave.deckIsPristine(backdropped)).isFalse()
    }

    @Test
    fun `a single slide carrying even a blank text element is not pristine`() {
        val withElement = blankDeck().addTextElementToSelected(StoryTextElement(id = "e1"))
        assertThat(StoryComposerAutosave.deckIsPristine(withElement)).isFalse()
    }

    @Test
    fun `a single slide carrying even a blank sticker is not pristine`() {
        val withSticker = blankDeck().addStickerToSelected(StoryStickerElement(id = "k1", emoji = ""))
        assertThat(StoryComposerAutosave.deckIsPristine(withSticker)).isFalse()
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

    // ---- canvas transform persistence ----

    private fun pannedTransform() =
        StoryCanvasTransform(scale = 2f).apply(panX = 40f, panY = -25f, zoom = 1f, canvasWidth = 1000f, canvasHeight = 1000f)

    @Test
    fun `toDraftSnapshot carries a non-identity canvas transform and maps identity to null`() {
        val transform = pannedTransform()
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .updateSelectedTransform(transform)
            .addSlide("s2")
            .updateSelectedText("plain")

        val snap = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now)

        assertThat(snap.slides.first().transform).isEqualTo(
            StoryDraftTransformSnapshot(
                scale = transform.scale,
                offsetX = transform.offsetX,
                offsetY = transform.offsetY,
            ),
        )
        assertThat(snap.slides[1].transform).isNull()
    }

    @Test
    fun `toDeck restores a persisted canvas transform and a null transform to identity`() {
        val snap = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(
                    id = "s1",
                    mediaIds = listOf("m1"),
                    transform = StoryDraftTransformSnapshot(scale = 3f, offsetX = 7f, offsetY = -4f),
                ),
                StoryDraftSlideSnapshot(id = "s2", text = "plain"),
            ),
            selectedId = "s1",
        )

        val deck = snap.toDeck()

        assertThat(deck).isNotNull()
        assertThat(deck!!.slides.first().transform)
            .isEqualTo(StoryCanvasTransform(scale = 3f, offsetX = 7f, offsetY = -4f))
        assertThat(deck.slides[1].transform).isEqualTo(StoryCanvasTransform.IDENTITY)
    }

    @Test
    fun `a canvas transform survives the deck-snapshot-deck round-trip`() {
        val transform = pannedTransform()
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .updateSelectedTransform(transform)

        val rebuilt = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now).toDeck()

        assertThat(rebuilt!!.slides.single().transform).isEqualTo(transform)
    }

    @Test
    fun `a media slide framed by a non-identity transform resolves to Save carrying that transform`() {
        val transform = pannedTransform()
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .updateSelectedTransform(transform)

        val action = StoryComposerAutosave.resolve(
            deck = deck,
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
        val snap = (action as StoryDraftPersist.Save).snapshot
        assertThat(snap.slides.single().transform).isEqualTo(
            StoryDraftTransformSnapshot(
                scale = transform.scale,
                offsetX = transform.offsetX,
                offsetY = transform.offsetY,
            ),
        )
    }

    @Test
    fun `panning an already-saved draft resolves to Save, not None`() {
        val deck = StorySlideDeck.single("s1").addMediaToSelected("m1")
        val previous = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "earlier")

        val action = StoryComposerAutosave.resolve(
            deck = deck.updateSelectedTransform(pannedTransform()),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = previous,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
    }

    // ---- photo filter persistence ----

    @Test
    fun `a single blank slide with a filter is not pristine`() {
        val filtered = blankDeck().setSelectedFilter(StoryFilter.BW)
        assertThat(StoryComposerAutosave.deckIsPristine(filtered)).isFalse()
    }

    @Test
    fun `toDraftSnapshot carries a filter and its intensity and maps no-filter to null`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .setSelectedFilter(StoryFilter.DRAMATIC)
            .setSelectedFilterIntensity(0.4f)
            .addSlide("s2")
            .updateSelectedText("plain")

        val snap = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now)

        assertThat(snap.slides.first().filter)
            .isEqualTo(StoryDraftFilterSnapshot(filter = StoryFilter.DRAMATIC, intensity = 0.4f))
        assertThat(snap.slides[1].filter).isNull()
    }

    @Test
    fun `toDeck restores a persisted filter and a null filter to no filter at default intensity`() {
        val snap = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(
                    id = "s1",
                    mediaIds = listOf("m1"),
                    filter = StoryDraftFilterSnapshot(filter = StoryFilter.WARM, intensity = 0.3f),
                ),
                StoryDraftSlideSnapshot(id = "s2", text = "plain"),
            ),
            selectedId = "s1",
        )

        val deck = snap.toDeck()

        assertThat(deck).isNotNull()
        assertThat(deck!!.slides.first().filter).isEqualTo(StoryFilter.WARM)
        assertThat(deck.slides.first().filterIntensity).isEqualTo(0.3f)
        assertThat(deck.slides[1].filter).isNull()
        assertThat(deck.slides[1].filterIntensity).isEqualTo(StoryFilterMatrix.DEFAULT_INTENSITY)
    }

    @Test
    fun `a filter and its intensity survive the deck-snapshot-deck round-trip`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .setSelectedFilter(StoryFilter.COOL)
            .setSelectedFilterIntensity(0.65f)

        val rebuilt = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now).toDeck()

        assertThat(rebuilt!!.slides.single().filter).isEqualTo(StoryFilter.COOL)
        assertThat(rebuilt.slides.single().filterIntensity).isEqualTo(0.65f)
    }

    @Test
    fun `a media slide with a filter resolves to Save carrying that filter`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .setSelectedFilter(StoryFilter.CHROME)

        val action = StoryComposerAutosave.resolve(
            deck = deck,
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
        val snap = (action as StoryDraftPersist.Save).snapshot
        assertThat(snap.slides.single().filter?.filter).isEqualTo(StoryFilter.CHROME)
    }

    @Test
    fun `applying a filter to an already-saved draft resolves to Save, not None`() {
        val deck = StorySlideDeck.single("s1").addMediaToSelected("m1")
        val previous = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "earlier")

        val action = StoryComposerAutosave.resolve(
            deck = deck.setSelectedFilter(StoryFilter.FADE),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = previous,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
    }

    // ---- pinned duration persistence ----

    @Test
    fun `toDraftSnapshot carries a pinned duration and maps no pin to null`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .setSelectedDuration(18.0)
            .addSlide("s2")
            .updateSelectedText("plain")

        val snap = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now)

        assertThat(snap.slides.first().durationSecondsPin).isEqualTo(18.0)
        assertThat(snap.slides[1].durationSecondsPin).isNull()
    }

    @Test
    fun `toDeck restores a persisted duration and a null pin to no pin`() {
        val snap = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(id = "s1", mediaIds = listOf("m1"), durationSecondsPin = 25.0),
                StoryDraftSlideSnapshot(id = "s2", text = "plain"),
            ),
            selectedId = "s1",
        )

        val deck = snap.toDeck()

        assertThat(deck).isNotNull()
        assertThat(deck!!.slides.first().durationSecondsPin).isEqualTo(25.0)
        assertThat(deck.slides[1].durationSecondsPin).isNull()
    }

    @Test
    fun `a pinned duration survives the deck-snapshot-deck round-trip`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .setSelectedDuration(33.0)

        val rebuilt = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now).toDeck()

        assertThat(rebuilt!!.slides.single().durationSecondsPin).isEqualTo(33.0)
    }

    @Test
    fun `a media slide with a pinned duration resolves to Save carrying that duration`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .setSelectedDuration(45.0)

        val action = StoryComposerAutosave.resolve(
            deck = deck,
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
        val snap = (action as StoryDraftPersist.Save).snapshot
        assertThat(snap.slides.single().durationSecondsPin).isEqualTo(45.0)
    }

    @Test
    fun `pinning a duration on an already-saved draft resolves to Save, not None`() {
        val deck = StorySlideDeck.single("s1").addMediaToSelected("m1")
        val previous = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "earlier")

        val action = StoryComposerAutosave.resolve(
            deck = deck.setSelectedDuration(20.0),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = previous,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
    }

    // ---- background persistence (colour + media + loop) ----

    @Test
    fun `toDraftSnapshot carries a colour background as its wire string and maps none to null`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .setSelectedBackground(StoryBackgroundValue.Gradient("FF2E63", "08D9D6"))
            .addSlide("s2")
            .updateSelectedText("plain")

        val snap = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now)

        assertThat(snap.slides.first().background).isEqualTo("gradient:FF2E63:08D9D6")
        assertThat(snap.slides[1].background).isNull()
    }

    @Test
    fun `toDraftSnapshot carries a designated background media and its loop flag`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("v1")
            .toggleSelectedBackgroundMedia("v1")
            .setSelectedBackgroundLoop(false)

        val snap = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now)

        assertThat(snap.slides.single().backgroundMediaId).isEqualTo("v1")
        assertThat(snap.slides.single().backgroundLoop).isFalse()
    }

    @Test
    fun `an undesignated slide snapshot carries no background media and a looping default`() {
        val snap = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .toDraftSnapshot(StoryVisibility.PUBLIC, null, now)

        assertThat(snap.slides.single().backgroundMediaId).isNull()
        assertThat(snap.slides.single().backgroundLoop).isTrue()
    }

    @Test
    fun `toDeck restores a persisted colour background and a null background to no backdrop`() {
        val snap = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(id = "s1", mediaIds = listOf("m1"), background = "9B59B6"),
                StoryDraftSlideSnapshot(id = "s2", text = "plain"),
            ),
            selectedId = "s1",
        )

        val deck = snap.toDeck()

        assertThat(deck).isNotNull()
        assertThat(deck!!.slides.first().background).isEqualTo(StoryBackgroundValue.Hex("9B59B6"))
        assertThat(deck.slides[1].background).isNull()
    }

    @Test
    fun `toDeck restores a designated background media and its loop flag`() {
        val snap = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(
                    id = "s1",
                    mediaIds = listOf("v1"),
                    backgroundMediaId = "v1",
                    backgroundLoop = false,
                ),
            ),
            selectedId = "s1",
        )

        val deck = snap.toDeck()

        assertThat(deck).isNotNull()
        assertThat(deck!!.slides.single().backgroundMediaId).isEqualTo("v1")
        assertThat(deck.slides.single().backgroundLoop).isFalse()
    }

    @Test
    fun `a colour background survives the deck-snapshot-deck round-trip`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .setSelectedBackground(StoryBackgroundValue.Gradient("F8B500", "FF2E63"))

        val rebuilt = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now).toDeck()

        assertThat(rebuilt!!.slides.single().background)
            .isEqualTo(StoryBackgroundValue.Gradient("F8B500", "FF2E63"))
    }

    @Test
    fun `a designated background media and its loop flag survive the deck-snapshot-deck round-trip`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("v1")
            .toggleSelectedBackgroundMedia("v1")
            .setSelectedBackgroundLoop(false)

        val rebuilt = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now).toDeck()

        assertThat(rebuilt!!.slides.single().backgroundMediaId).isEqualTo("v1")
        assertThat(rebuilt.slides.single().backgroundLoop).isFalse()
    }

    @Test
    fun `a media slide with a colour background resolves to Save carrying it`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .setSelectedBackground(StoryBackgroundValue.Hex("3498DB"))

        val action = StoryComposerAutosave.resolve(
            deck = deck,
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
        val snap = (action as StoryDraftPersist.Save).snapshot
        assertThat(snap.slides.single().background).isEqualTo("3498DB")
    }

    @Test
    fun `choosing a background on an already-saved draft resolves to Save, not None`() {
        val deck = StorySlideDeck.single("s1").addMediaToSelected("m1")
        val previous = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "earlier")

        val action = StoryComposerAutosave.resolve(
            deck = deck.setSelectedBackground(StoryBackgroundValue.Hex("000000")),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = previous,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
    }

    // ---- on-canvas text element persistence ----

    private fun styledElement() = StoryTextElement(
        id = "e1",
        text = "hello",
        style = StoryTextStyle.NEON,
        color = "FF00AA",
        align = StoryTextAlign.LEFT,
        size = StoryTextSize.LARGE,
        background = StoryTextBackground.Glass(radius = 24.0),
        outline = StoryTextOutline(width = 4f, color = "FFFFFF"),
        fade = StoryTextFade(inSeconds = 1.5f, outSeconds = 2f),
        timing = StoryElementTiming(startSeconds = 3f, durationSeconds = 5f),
        x = 0.3f,
        y = 0.8f,
        scale = 1.7f,
        rotationDeg = -30f,
    )

    @Test
    fun `toDraftSnapshot carries a text element with all its styled fields`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .addTextElementToSelected(styledElement())

        val snap = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now).slides.single().elements.single()

        assertThat(snap.text).isEqualTo("hello")
        assertThat(snap.style).isEqualTo("NEON")
        assertThat(snap.color).isEqualTo("FF00AA")
        assertThat(snap.align).isEqualTo("LEFT")
        assertThat(snap.size).isEqualTo("LARGE")
        assertThat(snap.background).isEqualTo(me.meeshy.sdk.model.StoryTextBackgroundStyle(type = "glass", radius = 24.0))
        assertThat(snap.outlineWidth).isEqualTo(4f)
        assertThat(snap.outlineColor).isEqualTo("FFFFFF")
        assertThat(snap.fadeIn).isEqualTo(1.5f)
        assertThat(snap.fadeOut).isEqualTo(2f)
        assertThat(snap.startSeconds).isEqualTo(3f)
        assertThat(snap.durationSeconds).isEqualTo(5f)
        assertThat(snap.x).isWithin(1e-4f).of(0.3f)
        assertThat(snap.y).isWithin(1e-4f).of(0.8f)
        assertThat(snap.scale).isWithin(1e-4f).of(1.7f)
        assertThat(snap.rotationDeg).isWithin(1e-4f).of(-30f)
    }

    @Test
    fun `toDeck restores a text element with all its styled fields`() {
        val snap = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(
                    id = "s1",
                    mediaIds = listOf("m1"),
                    elements = listOf(
                        StoryDraftTextElementSnapshot(
                            id = "e1",
                            text = "resume",
                            style = "TYPEWRITER",
                            color = "00FF00",
                            align = "RIGHT",
                            size = "XLARGE",
                            background = me.meeshy.sdk.model.StoryTextBackgroundStyle(type = "solid", hex = "123456"),
                            outlineWidth = 8f,
                            outlineColor = "000000",
                            fadeIn = 0.5f,
                            fadeOut = 1f,
                            startSeconds = 2f,
                            durationSeconds = 4f,
                            x = 0.25f,
                            y = 0.75f,
                            scale = 2.5f,
                            rotationDeg = 45f,
                        ),
                    ),
                ),
            ),
            selectedId = "s1",
        )

        val element = snap.toDeck()!!.slides.single().elements.single()

        assertThat(element).isEqualTo(
            StoryTextElement(
                id = "e1",
                text = "resume",
                style = StoryTextStyle.TYPEWRITER,
                color = "00FF00",
                align = StoryTextAlign.RIGHT,
                size = StoryTextSize.XLARGE,
                background = StoryTextBackground.Solid(hex = "123456"),
                outline = StoryTextOutline(width = 8f, color = "000000"),
                fade = StoryTextFade(inSeconds = 0.5f, outSeconds = 1f),
                timing = StoryElementTiming(startSeconds = 2f, durationSeconds = 4f),
                x = 0.25f,
                y = 0.75f,
                scale = 2.5f,
                rotationDeg = 45f,
            ),
        )
    }

    @Test
    fun `a styled text element survives the deck-snapshot-deck round-trip`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .addTextElementToSelected(styledElement())

        val rebuilt = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now).toDeck()

        assertThat(rebuilt!!.slides.single().elements.single()).isEqualTo(styledElement().normalised())
    }

    @Test
    fun `toDeck restores an unknown enum name and a blank colour to the element defaults`() {
        val snap = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(
                    id = "s1",
                    elements = listOf(
                        StoryDraftTextElementSnapshot(
                            id = "e1",
                            text = "x",
                            style = "ZZZ",
                            color = "",
                            align = "sideways",
                            size = "GIGANTIC",
                        ),
                    ),
                ),
            ),
            selectedId = "s1",
        )

        val element = snap.toDeck()!!.slides.single().elements.single()

        assertThat(element.style).isEqualTo(StoryTextStyle.BOLD)
        assertThat(element.color).isEqualTo(StoryTextElement.DEFAULT_COLOR)
        assertThat(element.align).isEqualTo(StoryTextAlign.CENTER)
        assertThat(element.size).isEqualTo(StoryTextSize.DEFAULT)
        assertThat(element.background).isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `a text-element-only slide resolves to Save carrying the element`() {
        val deck = StorySlideDeck.single("s1")
            .addTextElementToSelected(StoryTextElement(id = "e1", text = "solo"))

        val action = StoryComposerAutosave.resolve(
            deck = deck,
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
        val snap = (action as StoryDraftPersist.Save).snapshot
        assertThat(snap.slides.single().elements.single().text).isEqualTo("solo")
    }

    @Test
    fun `adding a text element to an already-saved draft resolves to Save, not None`() {
        val deck = StorySlideDeck.single("s1").addMediaToSelected("m1")
        val previous = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "earlier")

        val action = StoryComposerAutosave.resolve(
            deck = deck.addTextElementToSelected(StoryTextElement(id = "e1", text = "added")),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = previous,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
    }

    // ---- on-canvas sticker persistence ----

    private fun placedSticker() = StoryStickerElement(
        id = "k1",
        emoji = "🎉",
        x = 0.25f,
        y = 0.75f,
        scale = 1.8f,
        rotationDeg = -40f,
    )

    @Test
    fun `toDraftSnapshot carries a sticker with all its fields`() {
        val sticker = placedSticker()
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .addStickerToSelected(sticker)

        val snap = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now).slides.single().stickers.single()

        assertThat(snap.id).isEqualTo("k1")
        assertThat(snap.emoji).isEqualTo("🎉")
        assertThat(snap.x).isWithin(1e-4f).of(0.25f)
        assertThat(snap.y).isWithin(1e-4f).of(0.75f)
        assertThat(snap.scale).isWithin(1e-4f).of(1.8f)
        assertThat(snap.rotationDeg).isWithin(1e-4f).of(-40f)
    }

    @Test
    fun `toDeck restores a sticker with all its fields`() {
        val snap = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(
                    id = "s1",
                    mediaIds = listOf("m1"),
                    stickers = listOf(
                        me.meeshy.sdk.model.StoryDraftStickerElementSnapshot(
                            id = "k1",
                            emoji = "😀",
                            x = 0.2f,
                            y = 0.9f,
                            scale = 2.2f,
                            rotationDeg = 33f,
                        ),
                    ),
                ),
            ),
            selectedId = "s1",
        )

        val sticker = snap.toDeck()!!.slides.single().stickers.single()

        assertThat(sticker).isEqualTo(
            StoryStickerElement(id = "k1", emoji = "😀", x = 0.2f, y = 0.9f, scale = 2.2f, rotationDeg = 33f),
        )
    }

    @Test
    fun `a placed sticker survives the deck-snapshot-deck round-trip`() {
        val deck = StorySlideDeck.single("s1")
            .addMediaToSelected("m1")
            .addStickerToSelected(placedSticker())

        val rebuilt = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, now).toDeck()

        assertThat(rebuilt!!.slides.single().stickers.single()).isEqualTo(placedSticker().normalised())
    }

    @Test
    fun `toDeck re-normalises an out-of-range persisted sticker`() {
        val snap = StoryComposerDraftSnapshot(
            slides = listOf(
                StoryDraftSlideSnapshot(
                    id = "s1",
                    stickers = listOf(
                        me.meeshy.sdk.model.StoryDraftStickerElementSnapshot(
                            id = "k1",
                            emoji = "🎈",
                            x = 5f,
                            y = -3f,
                            scale = 999f,
                            rotationDeg = 540f,
                        ),
                    ),
                ),
            ),
            selectedId = "s1",
        )

        val sticker = snap.toDeck()!!.slides.single().stickers.single()

        assertThat(sticker).isEqualTo(
            StoryStickerElement(id = "k1", emoji = "🎈", x = 5f, y = -3f, scale = 999f, rotationDeg = 540f)
                .normalised(),
        )
    }

    @Test
    fun `a sticker-only slide resolves to Save carrying the sticker`() {
        val deck = StorySlideDeck.single("s1")
            .addStickerToSelected(StoryStickerElement(id = "k1", emoji = "🎉"))

        val action = StoryComposerAutosave.resolve(
            deck = deck,
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = null,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
        val snap = (action as StoryDraftPersist.Save).snapshot
        assertThat(snap.slides.single().stickers.single().emoji).isEqualTo("🎉")
    }

    @Test
    fun `adding a sticker to an already-saved draft resolves to Save, not None`() {
        val deck = StorySlideDeck.single("s1").addMediaToSelected("m1")
        val previous = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "earlier")

        val action = StoryComposerAutosave.resolve(
            deck = deck.addStickerToSelected(StoryStickerElement(id = "k1", emoji = "🎉")),
            visibility = StoryVisibility.PUBLIC,
            repostOfId = null,
            nowIso = now,
            previous = previous,
        )

        assertThat(action).isInstanceOf(StoryDraftPersist.Save::class.java)
    }
}
