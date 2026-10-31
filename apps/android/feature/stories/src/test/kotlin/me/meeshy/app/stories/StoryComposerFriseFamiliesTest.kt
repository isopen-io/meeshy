package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerObjectTiming
import me.meeshy.sdk.model.composer.timeline.TrackBar
import me.meeshy.sdk.model.scene.StoryElementTiming
import org.junit.Test

/**
 * La frise et la feuille Temps servent les cinq familles (#13904, iOS `TimelineViewModel.sceneFriseTracks`) : un média
 * posé, un lieu et une pastille de son ont chacun leur piste, nommée par sa famille quand il n'a pas de nom, réglable
 * comme celle d'un texte, et toucher la piste sélectionne l'objet. Le fond n'a pas de piste réglable : il dure la slide.
 */
class StoryComposerFriseFamiliesTest {

    private val paris = SharedPlace(latitude = 48.8, longitude = 2.3, name = "Paris")

    private fun media(id: String, mime: String) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 10, height = 10, durationMs = 8000, thumbnailUrl = null)

    private fun scene(): StoryComposerUiState {
        val slide = StorySlide(
            id = "s",
            mediaIds = listOf("bg", "v1", "p1"),
            backgroundMediaId = "bg",
            placedMedia = listOf(
                StoryPlacedMedia("v1", zIndex = 1, timing = StoryElementTiming(1f, 2f)),
                StoryPlacedMedia("p1", zIndex = 2),
            ),
            places = listOf(StoryLocationObject(id = "l1", place = paris, zIndex = 3)),
            audio = listOf(
                StoryAudioPlayerObject(id = "a1", postMediaId = "pm-a1", x = 0.5, y = 0.7, zIndex = 4),
                StoryAudioPlayerObject(id = "amb", postMediaId = "pm-amb", isBackground = true),
            ),
        )
        return StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), slide.id),
            attachments = listOf(media("bg", "image/jpeg"), media("v1", "video/mp4"), media("p1", "image/png")),
        ).mirrorDraftToSelection()
    }

    @Test
    fun `a placed media, a place and a sound chip each have their own track, adjustable like a text`() {
        val state = scene()

        val ids = state.sceneTracks.map { it.id }
        assertThat(ids).containsAtLeast("v1", "p1", "l1", "a1")
        assertThat(ids).doesNotContain("bg")
        assertThat(state.sceneEditableTrackIds).containsExactly("v1", "p1", "l1", "a1")
        assertThat(state.sceneTracks.single { it.id == "v1" }.bar).isEqualTo(TrackBar.Timed(1.0, 3.0))
        assertThat(state.sceneTracks.single { it.id == "p1" }.bar).isEqualTo(TrackBar.Ghost)
    }

    @Test
    fun `a track without a name is called by its family, a place by its name`() {
        val names = scene().sceneTrackNames

        assertThat(names["v1"]).isEqualTo(SceneTrackName(SceneObjectFamily.VIDEO))
        assertThat(names["p1"]).isEqualTo(SceneTrackName(SceneObjectFamily.IMAGE))
        assertThat(names["l1"]).isEqualTo(SceneTrackName(SceneObjectFamily.PLACE, "Paris"))
        assertThat(names["a1"]).isEqualTo(SceneTrackName(SceneObjectFamily.SOUND))
    }

    @Test
    fun `a window laid on the frise lands on a placed media, a place and a sound chip`() {
        val media = StoryComposerSceneReducer.windowed(scene(), "p1", 2f, 3f)
        assertThat(media.deck.selectedSlide.placedMedia.single { it.id == "p1" }.timing).isEqualTo(StoryElementTiming(2f, 3f))

        val place = StoryComposerSceneReducer.windowed(scene(), "l1", 1f, 0f).deck.selectedSlide.places.single()
        assertThat(place.startTime to place.duration).isEqualTo(1.0 to null)

        val sound = StoryComposerSceneReducer.windowed(scene(), "a1", 0f, 4f).deck.selectedSlide.audio.single { it.id == "a1" }
        assertThat(sound.startTime to sound.duration).isEqualTo(null to 4f)
    }

    @Test
    fun `touching a track selects its object, whatever its family`() {
        assertThat(StoryComposerSceneReducer.trackSelected(scene(), "v1").selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.MEDIA, "v1"))
        assertThat(StoryComposerSceneReducer.trackSelected(scene(), "l1").selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.PLACE, "l1"))
        assertThat(StoryComposerSceneReducer.trackSelected(scene(), "a1").selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.AUDIO, "a1"))
    }

    @Test
    fun `the Time sheet reads the family and the window of the selected object`() {
        val video = StoryComposerSceneReducer.trackSelected(scene(), "v1")
        assertThat(video.selectedObjectFamily).isEqualTo(SceneObjectFamily.VIDEO)
        assertThat(video.selectedObjectWindow).isEqualTo(ComposerObjectTiming(1.0, 3.0))

        val place = StoryComposerSceneReducer.trackSelected(scene(), "l1")
        assertThat(place.selectedObjectFamily).isEqualTo(SceneObjectFamily.PLACE)
        assertThat(place.selectedObjectWindow).isEqualTo(ComposerObjectTiming(0.0, null))
    }

    @Test
    fun `a window set from the sheet is stored as start and duration, permanent kept open-ended`() {
        val ref = SceneObjectRef(ComposerObjectKind.MEDIA, "p1")
        val timed = StoryComposerObjectTimeReducer.windowed(scene(), ref, ComposerObjectTiming(1.5, 4.0))
        assertThat(timed.deck.selectedSlide.placedMedia.single { it.id == "p1" }.timing).isEqualTo(StoryElementTiming(1.5f, 2.5f))

        val permanent = StoryComposerObjectTimeReducer.windowed(timed, ref, ComposerObjectTiming(1.5, 4.0).madePermanent)
        assertThat(permanent.deck.selectedSlide.placedMedia.single { it.id == "p1" }.timing).isEqualTo(StoryElementTiming(1.5f, 0f))
    }
}
