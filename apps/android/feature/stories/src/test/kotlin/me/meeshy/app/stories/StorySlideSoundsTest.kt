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
                s.copy(audio = (1..50).map { StoryAudioPlayerObject(id = "r$it", isBackground = false) })
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
        val fiveForeground = (1..50).map { StoryAudioPlayerObject(id = "r$it", isBackground = false) }
        val fourPlusBackground = (1..49).map { StoryAudioPlayerObject(id = "r$it", isBackground = false) } +
            StoryAudioPlayerObject(id = "bg", isBackground = true)
        assertThat(stateWith(emptyList()).canBorrowSound).isTrue()
        assertThat(stateWith(fiveForeground).canBorrowSound).isFalse()
        val borrowedBackground = fourPlusBackground.map { if (it.id == "bg") it.copy(soundId = "s0") else it }
        assertThat(stateWith(borrowedBackground).canBorrowSound).isTrue()
        // un fond CAPTÉ n'est pas remplacé : il descend au premier plan, et la sixième piste n'a pas de place
        assertThat(stateWith(fourPlusBackground).canBorrowSound).isFalse()
        assertThat(stateWith(fourPlusBackground).selectedSlideBackgroundSound!!.id).isEqualTo("bg")
    }

    @Test
    fun `media and sounds have their own fifty buckets and no longer share a cap`() {
        fun deckWith(media: Int, sounds: Int) = StorySlideDeck(
            slides = listOf(
                StorySlide(
                    id = "a",
                    mediaIds = (1..media).map { "m$it" },
                    audio = (1..sounds).map { StoryAudioPlayerObject(id = "r$it", isBackground = false) },
                ),
            ),
            selectedId = "a",
        )
        val imagesFull = deckWith(media = 50, sounds = 0)
        assertThat(StoryComposerUiState(deck = imagesFull).canBorrowSound).isTrue()
        assertThat(imagesFull.selectedCanAddMedia).isFalse()
        assertThat(imagesFull.addMediaToSelected("new")).isSameInstanceAs(imagesFull)
        val soundsFull = deckWith(media = 0, sounds = 50)
        assertThat(soundsFull.selectedCanAddMedia).isTrue()
        assertThat(soundsFull.borrowSoundOnSelected(shelfSound)).isSameInstanceAs(soundsFull)
        assertThat(deckWith(media = 6, sounds = 30).selectedRemainingMediaSlots).isEqualTo(44)
        assertThat(deckWith(media = 6, sounds = 30).addMediaToSelected("new").selectedSlide.mediaIds).hasSize(7)
    }

    private fun slideWith(media: Int, sounds: Int) = StorySlideDeck(
        slides = listOf(
            StorySlide(
                id = "a",
                mediaIds = (1..media).map { "m$it" },
                audio = (1..sounds).map { StoryAudioPlayerObject(id = "r$it", isBackground = false) },
            ),
        ),
        selectedId = "a",
    )

    @Test
    fun `a story composed past the old ten cap still publishes, every media and sound kept`() {
        val legacy = slideWith(media = 10, sounds = 3)
        val state = StoryComposerUiState(deck = legacy)
        assertThat(state.canPublish).isTrue()
        assertThat(legacy.publishableSlides.single().mediaIds).hasSize(10)
        assertThat(legacy.publishableSlides.single().audio).hasSize(3)
        assertThat(legacy.selectedCanAddMedia).isTrue()
        assertThat(state.canBorrowSound).isTrue()
    }

    @Test
    fun `the sound door names the cap it hit`() {
        assertThat(StoryComposerUiState(deck = slideWith(media = 0, sounds = 50)).soundCapRefusal)
            .isEqualTo(me.meeshy.feature.stories.R.string.composer_scene_cap_sound)
    }

    @Test
    fun `the gallery opens with the places left, sounds not counted`() {
        assertThat(StoryComposerUiState(deck = slideWith(media = 49, sounds = 5)).mediaPickMode).isEqualTo(StoryMediaPickMode.Single)
        assertThat(StoryComposerUiState(deck = slideWith(media = 50, sounds = 0)).mediaPickMode).isEqualTo(StoryMediaPickMode.None)
        assertThat(StoryComposerUiState(deck = slideWith(media = 3, sounds = 20)).mediaPickMode).isEqualTo(StoryMediaPickMode.Multiple)
    }
}
