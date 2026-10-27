package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.ApiSoundUploader
import org.junit.Test

/**
 * Le son d'une slide : il appartient à la SLIDE (arbitrage porteur 2026-09-01, #4673), se publie dans
 * `storyEffects.audioPlayerObjects`, survit au brouillon, et suffit à faire une story publiable.
 */
class StorySlideSoundsTest {
    private val shelfSound = ApiSound(
        id = "s1", title = "Pulse", fileUrl = "https://cdn/s1.m4a", durationMs = 6000,
        uploader = ApiSoundUploader("u", "belva"),
    )

    private fun deck(vararg ids: String) =
        StorySlideDeck(slides = ids.map { StorySlide(id = it) }, selectedId = ids.first())

    @Test
    fun `borrowing lands on the selected slide only`() {
        val out = deck("a", "b").borrowSoundOnSelected(shelfSound)
        assertThat(out.slides[0].audio.single().soundId).isEqualTo("s1")
        assertThat(out.slides[1].audio).isEmpty()
    }

    @Test
    fun `a sound alone makes a slide publishable`() {
        assertThat(deck("a").publishableSlides).isEmpty()
        assertThat(deck("a").borrowSoundOnSelected(shelfSound).publishableSlides).hasSize(1)
        assertThat(deck("a").hasSounds).isFalse()
        assertThat(deck("a").borrowSoundOnSelected(shelfSound).hasSounds).isTrue()
    }

    @Test
    fun `removing and muting act on the selected slide track`() {
        val borrowed = deck("a").borrowSoundOnSelected(shelfSound)
        val id = borrowed.selectedSlide.audio.single().id
        assertThat(borrowed.toggleSelectedSoundMute(id).selectedSlide.audio.single().isMuted).isTrue()
        assertThat(borrowed.removeSelectedSound(id).selectedSlide.audio).isEmpty()
    }

    @Test
    fun `a refused placement leaves the deck untouched`() {
        val full = deck("a").let { d ->
            d.copy(slides = d.slides.map { s ->
                s.copy(audio = (1..5).map { StoryAudioPlayerObject(id = "r$it", isBackground = false) })
            })
        }
        assertThat(full.borrowSoundOnSelected(shelfSound)).isSameInstanceAs(full)
    }

    @Test
    fun `the draft publishes the borrowed track in the story effects with its identity`() {
        val audio = deck("a").borrowSoundOnSelected(shelfSound).selectedSlide.audio
        val request = StoryComposerDraft(audio = audio).toCreateStoryRequest("fr")
        val track = request.storyEffects!!.audioPlayerObjects!!.single()
        assertThat(track.soundId).isEqualTo("s1")
        assertThat(track.mediaURL).isEqualTo("https://cdn/s1.m4a")
        assertThat(track.soundAuthorUsername).isEqualTo("belva")
        assertThat(StoryComposerDraft(audio = audio).canPublish).isTrue()
    }

    @Test
    fun `without a sound the effects carry no audio list`() {
        val request = StoryComposerDraft(text = "x").toCreateStoryRequest("fr")
        assertThat(request.storyEffects?.audioPlayerObjects).isNull()
    }

    @Test
    fun `sounds round trip through the autosave snapshot`() {
        val withSound = deck("a").borrowSoundOnSelected(shelfSound)
        val save = StoryComposerAutosave.resolve(
            deck = withSound, visibility = StoryVisibility.PUBLIC, repostOfId = null,
            nowIso = "2026-10-27T10:00:00Z", previous = null,
        )
        val snapshot = (save as StoryDraftPersist.Save).snapshot
        assertThat(snapshot.toDeck()!!.selectedSlide.audio).isEqualTo(withSound.selectedSlide.audio)
        assertThat(StoryComposerAutosave.deckIsPristine(withSound)).isFalse()
    }

    @Test
    fun `a full scene accepts a borrowed background only when it replaces a borrowed one`() {
        fun stateWith(audio: List<StoryAudioPlayerObject>) = StoryComposerUiState(
            deck = StorySlideDeck(slides = listOf(StorySlide(id = "a", audio = audio)), selectedId = "a"),
        )
        val fiveForeground = (1..5).map { StoryAudioPlayerObject(id = "r$it", isBackground = false) }
        val fourPlusBackground = (1..4).map { StoryAudioPlayerObject(id = "r$it", isBackground = false) } +
            StoryAudioPlayerObject(id = "bg", isBackground = true)
        assertThat(stateWith(emptyList()).canBorrowSound).isTrue()
        assertThat(stateWith(fiveForeground).canBorrowSound).isFalse()
        val borrowedBackground = fourPlusBackground.map { if (it.id == "bg") it.copy(soundId = "s0") else it }
        assertThat(stateWith(borrowedBackground).canBorrowSound).isTrue()
        // un fond CAPTÉ n'est pas remplacé : il descend au premier plan, et la sixième piste n'a pas de place
        assertThat(stateWith(fourPlusBackground).canBorrowSound).isFalse()
        assertThat(stateWith(fourPlusBackground).selectedSlideBackgroundSound!!.id).isEqualTo("bg")
    }
}
