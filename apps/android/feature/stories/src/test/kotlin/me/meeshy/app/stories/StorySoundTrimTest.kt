package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.media.MediaTrimBounds
import org.junit.Test

/** #13601 : un son touché règle sa fenêtre propre dans sa source, comme iOS. */
class StorySoundTrimTest {
    private val trim = ComposerObjectEditorSection.Media(MediaEditTool.TRIM)

    private fun apiSound(durationMs: Long? = 30_000) = ApiSound(id = "s1", title = "T", fileUrl = "https://cdn/s.mp3", durationMs = durationMs)

    private fun borrowed(durationMs: Long? = 30_000): StoryComposerUiState {
        val deck = StorySlideDeck.single("s").borrowSoundOnSelected(apiSound(durationMs))
        return StoryComposerUiState(deck = deck).mirrorDraftToSelection()
    }

    private fun touched(state: StoryComposerUiState) = StoryComposerSelectionReducer.soundSelected(state, "borrowed-s1")

    @Test
    fun `emprunter un son retient la duree de sa source`() {
        assertThat(borrowed().deck.selectedSlide.soundSources).containsExactly("borrowed-s1", 30f)
        assertThat(borrowed(durationMs = null).deck.selectedSlide.soundSources).isEmpty()
    }

    @Test
    fun `un son dont la source est connue sert son rognage en premier, comme iOS`() {
        val served = touched(borrowed()).servedSoundSections
        assertThat(served).containsExactly(trim, ComposerObjectEditorSection.Timing, ComposerObjectEditorSection.Plan).inOrder()
        assertThat(touched(borrowed()).openSoundSection).isEqualTo(trim)
    }

    @Test
    fun `un son sans source mesuree ne sert aucun bouton de rognage`() {
        val served = touched(borrowed(durationMs = null)).servedSoundSections
        assertThat(served).containsExactly(ComposerObjectEditorSection.Timing, ComposerObjectEditorSection.Plan).inOrder()
    }

    @Test
    fun `rogner pose la fenetre et la duree occupee, et le Temps ne perd pas la source`() {
        val trimmed = StoryComposerSelectionReducer.soundTrimmed(touched(borrowed()), "borrowed-s1", MediaTrimBounds(4.0, 10.0))
        val sound = trimmed.deck.selectedSlide.audio.single()
        assertThat(sound.sourceStart).isEqualTo(4f)
        assertThat(sound.sourceEnd).isEqualTo(10f)
        assertThat(sound.duration).isEqualTo(6f)
        assertThat(trimmed.deck.selectedSlide.soundSources["borrowed-s1"]).isEqualTo(30f)
        val widened = StoryComposerSelectionReducer.soundTrimmed(trimmed, "borrowed-s1", MediaTrimBounds(2.0, 25.0))
        assertThat(widened.deck.selectedSlide.audio.single().sourceEnd).isEqualTo(25f)
    }

    @Test
    fun `une poignee ne franchit pas l autre et la source entiere efface la fenetre`() {
        val trimmed = StoryComposerSelectionReducer.soundTrimmed(touched(borrowed()), "borrowed-s1", MediaTrimBounds(20.0, 5.0))
        assertThat(trimmed.deck.selectedSlide.audio.single().sourceStart).isNull()
        val whole = StoryComposerSelectionReducer.soundTrimmed(
            StoryComposerSelectionReducer.soundTrimmed(touched(borrowed()), "borrowed-s1", MediaTrimBounds(4.0, 10.0)),
            "borrowed-s1", MediaTrimBounds(0.0, 30.0),
        )
        val sound = whole.deck.selectedSlide.audio.single()
        assertThat(sound.sourceStart).isNull()
        assertThat(sound.sourceEnd).isNull()
        assertThat(sound.duration).isEqualTo(30f)
    }

    @Test
    fun `rogner une piste inconnue ou sans source ne change rien`() {
        val state = touched(borrowed())
        assertThat(StoryComposerSelectionReducer.soundTrimmed(state, "fantome", MediaTrimBounds(1.0, 5.0))).isEqualTo(state)
        val noSource = touched(borrowed(durationMs = null))
        assertThat(StoryComposerSelectionReducer.soundTrimmed(noSource, "borrowed-s1", MediaTrimBounds(1.0, 5.0))).isEqualTo(noSource)
    }

    @Test
    fun `la fenetre posee voyage sur la piste publiee`() {
        val trimmed = StoryComposerSelectionReducer.soundTrimmed(touched(borrowed()), "borrowed-s1", MediaTrimBounds(4.0, 10.0))
        val request = StoryComposerDraft(audio = trimmed.deck.selectedSlide.audio).toCreateStoryRequest("en")
        val published = request.storyEffects?.audioPlayerObjects?.single()
        assertThat(published?.sourceStart).isEqualTo(4f)
        assertThat(published?.sourceEnd).isEqualTo(10f)
    }

    @Test
    fun `le brouillon garde la source et ignore une valeur hostile`() {
        val trimmed = StoryComposerSelectionReducer.soundTrimmed(touched(borrowed()), "borrowed-s1", MediaTrimBounds(4.0, 10.0))
        val snapshot = trimmed.deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "now")
        assertThat(snapshot.toDeck()?.selectedSlide?.soundSources).containsExactly("borrowed-s1", 30f)
        val hostile = snapshot.copy(slides = snapshot.slides.map { it.copy(soundSources = mapOf("borrowed-s1" to Float.NaN, "fantome" to 5f)) })
        assertThat(hostile.toDeck()?.selectedSlide?.soundSources).isEmpty()
    }

    @Test
    fun `retirer le son efface sa source`() {
        val deck = borrowed().deck.removeSelectedSound("borrowed-s1")
        assertThat(deck.selectedSlide.soundSources).isEmpty()
        assertThat(StoryAudioPlayerObject(id = "x").sourceStart).isNull()
    }
}
