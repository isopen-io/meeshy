package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.StoryLimits
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/** #13590 — plafonds larges : 50 par famille et par scène, 1000 caractères par texte, 2 h au total. */
@RunWith(JUnit4::class)
class StoryLimitsDecisionTest {

    private fun sticker(i: Int) = StoryStickerElement(id = "s$i", emoji = "😀")
    private fun text(i: Int) = StoryTextElement(id = "t$i", text = "x")

    @Test
    fun `le deck plafonne chaque famille a cinquante par scene`() {
        assertThat(StorySlideDeck.MAX_STICKERS_PER_SLIDE).isEqualTo(50)
        assertThat(StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE).isEqualTo(50)
        assertThat(StorySlideDeck.MAX_MEDIA_PER_SLIDE).isEqualTo(50)
        assertThat(StoryComposerDraft.MAX_MEDIA).isEqualTo(50)
    }

    @Test
    fun `le cinquante et unieme sticker est refuse et le bouton se desactive`() {
        val full = (1..50).fold(StorySlideDeck.single("a")) { deck, i -> deck.addStickerToSelected(sticker(i)) }
        assertThat(full.selectedSlide.stickers).hasSize(50)
        assertThat(full.selectedCanAddSticker).isFalse()
        assertThat(full.addStickerToSelected(sticker(51))).isSameInstanceAs(full)
    }

    @Test
    fun `le cinquante et unieme texte est refuse`() {
        val full = (1..50).fold(StorySlideDeck.single("a")) { deck, i -> deck.addTextElementToSelected(text(i)) }
        assertThat(full.selectedCanAddTextElement).isFalse()
        assertThat(full.addTextElementToSelected(text(51))).isSameInstanceAs(full)
    }

    @Test
    fun `la saisie d un texte pose est coupee a mille caracteres avec un message`() {
        val state = StoryComposerTextReducer.added(StoryComposerUiState(), "t1")
        val typed = StoryComposerTextReducer.typed(state, "a".repeat(1200))
        assertThat(typed.deck.selectedSlide.elements.single().text).hasLength(1000)
        assertThat(typed.errorMessage).isEqualTo(StoryComposerViewModel.TEXT_LENGTH_LIMIT)
        val within = StoryComposerTextReducer.typed(state, "a".repeat(1000))
        assertThat(within.errorMessage).isNull()
    }

    @Test
    fun `un brouillon dont un texte depasse mille caracteres ne se publie pas`() {
        val deck = StorySlideDeck.single("a").addTextElementToSelected(StoryTextElement(id = "t", text = "a".repeat(1001)))
        assertThat(deck.isWithinElementTextLimit()).isFalse()
        assertThat(StoryComposerUiState(deck = deck).canPublish).isFalse()
    }

    @Test
    fun `la duree totale s additionne sur toutes les slides et ne passe jamais deux heures`() {
        val deck = StorySlideDeck(slides = (1..10).map { StorySlide(id = "s$it", durationSecondsPin = 600.0) }, selectedId = "s1")
        assertThat(deck.totalDurationSeconds).isEqualTo(6000.0)
        assertThat(deck.isWithinTotalDuration()).isTrue()
        val over = StorySlideDeck(slides = (1..13).map { StorySlide(id = "s$it", durationSecondsPin = 600.0) }, selectedId = "s1")
        assertThat(over.isWithinTotalDuration()).isFalse()
    }

    @Test
    fun `la duree epinglee d une slide est ramenee au budget que les autres laissent`() {
        val slides = (1..12).map { StorySlide(id = "s$it", durationSecondsPin = 600.0) }
        val deck = StorySlideDeck(slides = slides, selectedId = "s1")
        val pinned = deck.setSelectedDuration(600.0)
        assertThat(pinned.selectedSlide.durationSecondsPin).isEqualTo(StoryLimits.TOTAL_SECONDS - 11 * 600.0)
    }

    @Test
    fun `une frappe dans un texte restaure de plus de mille caracteres le garde et le signale`() {
        val long = "a".repeat(1200)
        val state = StoryComposerTextReducer.added(StoryComposerUiState(), "t1")
            .let { StoryComposerTextReducer.typed(it, "a") }
            .let { it.copy(deck = it.deck.updateTextElement("t1") { e -> e.copy(text = long) }) }
        val typed = StoryComposerTextReducer.typed(state, long + "b")
        assertThat(typed.deck.selectedSlide.elements.single().text).hasLength(1201)
        assertThat(typed.errorMessage).isEqualTo(StoryComposerViewModel.TEXT_LENGTH_LIMIT)
        assertThat(typed.publishBlock).isEqualTo(StoryPublishBlock.TEXT_TOO_LONG)
        assertThat(typed.canPublish).isFalse()
    }

    @Test
    fun `un brouillon trop long dit pourquoi la publication est bloquee`() {
        val deck = StorySlideDeck.single("a").addTextElementToSelected(StoryTextElement(id = "t", text = "a".repeat(1001)))
        assertThat(StoryComposerUiState(deck = deck).publishBlock).isEqualTo(StoryPublishBlock.TEXT_TOO_LONG)
        assertThat(StoryComposerUiState(deck = StorySlideDeck.single("a").addTextElementToSelected(text(1))).publishBlock).isNull()
    }

    @Test
    fun `une duree de plus de deux heures nomme la duree`() {
        val over = StorySlideDeck(slides = (1..13).map { StorySlide(id = "s$it", durationSecondsPin = 600.0) }, selectedId = "s1")
        assertThat(StoryComposerUiState(deck = over).publishBlock).isEqualTo(StoryPublishBlock.DURATION_TOO_LONG)
    }

    @Test
    fun `une republication n est pas bloquee par la longueur du texte stocke`() {
        val deck = StorySlideDeck.single("a").addTextElementToSelected(StoryTextElement(id = "t", text = "a".repeat(1800)))
        val repost = StoryComposerUiState(deck = deck, draft = StoryComposerDraft().withRepostOf("aaaaaaaaaaaaaaaaaaaaaaaa"))
        assertThat(repost.publishBlock).isNull()
        assertThat(repost.canPublish).isTrue()
    }
}
