package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerSelectionAction.DUPLICATE
import me.meeshy.sdk.model.composer.ComposerSelectionAction.EDIT
import me.meeshy.sdk.model.composer.ComposerSelectionAction.REMOVE
import me.meeshy.sdk.model.composer.ComposerSelectionAction.TIME
import me.meeshy.sdk.model.scene.StoryElementTiming
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * La barre de sélection sert, à CHAQUE famille posée sur la scène — texte, sticker, média posé, lieu, pastille de son —,
 * les actions de la maquette (#13902, spec un-seul-compositeur R6, iOS `ComposerSelectionActions.served`) : Dupliquer et
 * Temps compris, sans attendre une scène animée ; l'Ordre seulement quand un autre objet partage la scène ; un fond
 * (média ou son d'ambiance) ne se duplique ni ne se règle dans le temps, il dure la slide entière.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerSelectionFamiliesTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val paris = SharedPlace(latitude = 48.8, longitude = 2.3, name = "Paris")

    private fun photo(id: String) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = "image/jpeg", fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun scene(slide: StorySlide, vararg attachments: UploadedMedia): StoryComposerUiState =
        StoryComposerUiState(deck = StorySlideDeck(listOf(slide), slide.id), attachments = attachments.toList()).mirrorDraftToSelection()

    private fun withPlacedPhoto(vararg more: StoryPlacedMedia): StoryComposerUiState =
        scene(
            StorySlide(id = "s", mediaIds = listOf("m1"), placedMedia = listOf(StoryPlacedMedia("m1", x = 0.4f, y = 0.4f, zIndex = 1)) + more),
            photo("m1"),
        )

    private fun withPlace(): StoryComposerUiState =
        scene(StorySlide(id = "s", places = listOf(StoryLocationObject(id = "l1", place = paris, x = 0.3, y = 0.3, zIndex = 1))))

    private fun withVoice(): StoryComposerUiState =
        scene(
            StorySlide(
                id = "s",
                audio = listOf(StoryAudioPlayerObject(id = "a1", postMediaId = "pm-a1", x = 0.5, y = 0.7, zIndex = 1)),
                soundSources = mapOf("a1" to 12f),
            ),
        )

    private fun mediaRef(id: String) = SceneObjectRef(ComposerObjectKind.MEDIA, id)

    @Test
    fun `every family placed on the scene serves Duplicate and Time, the scene left still`() {
        val text = StoryComposerTextReducer.tapped(
            StoryComposerTextReducer.deselected(StoryComposerTextReducer.typed(StoryComposerTextReducer.added(StoryComposerUiState(), "t1"), "mot")),
            "t1",
        )
        val sticker = StoryComposerStickerReducer.added(StoryComposerUiState(), "😀", "k1")
        val media = StoryComposerSelectionReducer.mediaSelected(withPlacedPhoto(), "m1")
        val place = StoryComposerReferencesReducer.selected(withPlace(), "l1")
        val voice = StoryComposerSelectionReducer.soundSelected(withVoice(), "a1")

        listOf(text, sticker, media, place, voice).forEach { state ->
            assertThat(state.sceneIsAnimated).isFalse()
            assertThat(state.selectionBar!!.actions).containsAtLeast(DUPLICATE, TIME, REMOVE).inOrder()
        }
        assertThat(media.selectionBar!!.actions).containsExactly(EDIT, DUPLICATE, TIME, REMOVE).inOrder()
        assertThat(voice.selectionBar!!.actions).containsExactly(EDIT, DUPLICATE, TIME, REMOVE).inOrder()
    }

    @Test
    fun `no Order joins the bar, alone or sharing the scene`() {
        val alone = StoryComposerSelectionReducer.mediaSelected(withPlacedPhoto(), "m1")
        val shared = StoryComposerReferencesReducer.selected(
            withPlace().let { it.copy(deck = it.deck.addPlaceToSelected(StoryLocationObject(id = "l2", place = paris))) },
            "l1",
        )

        assertThat(alone.selectionBar!!.actions).containsExactly(EDIT, DUPLICATE, TIME, REMOVE).inOrder()
        assertThat(shared.selectionBar!!.actions).containsExactly(EDIT, DUPLICATE, TIME, REMOVE).inOrder()
    }

    @Test
    fun `a place is edited like on iOS, its Modify repointing the pastille where it stands`() {
        val selected = StoryComposerReferencesReducer.selected(withPlace(), "l1")
        val lyon = SharedPlace(latitude = 45.7, longitude = 4.8, name = "Lyon")

        assertThat(selected.selectionBar!!.actions).containsExactly(EDIT, DUPLICATE, TIME, REMOVE).inOrder()
        assertThat(selected.serves(StoryComposerSheet.PLACE_REPOINT)).isTrue()
        val repointed = StoryComposerReferencesReducer.repointed(selected, "l1", lyon)
        assertThat(repointed.deck.selectedSlide.places.single()).isEqualTo(withPlace().deck.selectedSlide.places.single().copy(place = lyon))
        assertThat(repointed.selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.PLACE, "l1"))
        assertThat(StoryComposerReferencesReducer.repointed(selected, "ghost", lyon)).isSameInstanceAs(selected)
        assertThat(StoryComposerSelectionReducer.cleared(selected).serves(StoryComposerSheet.PLACE_REPOINT)).isFalse()
    }

    @Test
    fun `a background, media or ambient sound, is neither duplicated nor timed`() {
        val backdrop = StoryComposerSelectionReducer.mediaSelected(scene(StorySlide(id = "s", mediaIds = listOf("m1")), photo("m1")), "m1")
        val ambient = StoryComposerSelectionReducer.soundSelected(
            scene(StorySlide(id = "s", audio = listOf(StoryAudioPlayerObject(id = "a1", isBackground = true)))),
            "a1",
        )

        listOf(backdrop, ambient).forEach { state ->
            assertThat(state.selectionBar!!.actions).containsNoneOf(DUPLICATE, TIME)
        }
    }

    @Test
    fun `a duplicated placed media lands offset, on top and selected, naming the same file`() {
        val underAPlace = withPlacedPhoto().let { it.copy(deck = it.deck.addPlaceToSelected(StoryLocationObject(id = "l1", place = paris))) }
        val copied = StoryComposerObjectCopyReducer.duplicated(StoryComposerSelectionReducer.mediaSelected(underAPlace, "m1"), mediaRef("m1"), "c1")

        val slide = copied.deck.selectedSlide
        val copy = slide.placedMedia.single { it.id == "c1" }
        assertThat(copy.mediaId).isEqualTo("m1")
        assertThat(copy.x).isWithin(1e-4f).of(0.45f)
        assertThat(copy.y).isWithin(1e-4f).of(0.45f)
        assertThat(StorySceneStack.order(slide).last()).isEqualTo(mediaRef("c1"))
        assertThat(copied.selectedSceneObject).isEqualTo(mediaRef("c1"))
        assertThat(slide.mediaIds).containsExactly("m1")
        assertThat(copied.attachments).isEqualTo(underAPlace.attachments)
        assertThat(copied.pendingUploads).isEmpty()
    }

    @Test
    fun `the copy of a media publishes as a second object of the same post media, never a second upload`() {
        val copied = StoryComposerObjectCopyReducer.duplicated(withPlacedPhoto(), mediaRef("m1"), "c1")

        val published = StoryPublishPlacedMedia.resolve(copied.deck.selectedSlide, copied)

        assertThat(published.map { it.id }).containsExactly("m1", "c1").inOrder()
        assertThat(published.map { it.postMediaId }).containsExactly("m1", "m1")
        assertThat(published.map { it.mediaURL }).containsExactly("https://cdn/m1", "https://cdn/m1")
    }

    @Test
    fun `the copy of a media is its own object, moved, filtered and removed alone`() {
        val copied = StoryComposerObjectCopyReducer.duplicated(withPlacedPhoto(), mediaRef("m1"), "c1")

        val moved = StoryComposerPlacedMediaReducer.moved(copied, "c1", 0.1f, 0f)
        assertThat(moved.deck.selectedSlide.placedMedia.single { it.id == "m1" }.x).isWithin(1e-4f).of(0.4f)
        assertThat(moved.deck.selectedSlide.placedMedia.single { it.id == "c1" }.x).isWithin(1e-4f).of(0.55f)

        val removed = StoryComposerPlacedMediaReducer.objectRemoved(StoryComposerSelectionReducer.mediaSelected(copied, "c1"), "c1")
        assertThat(removed.deck.selectedSlide.placedMedia.map { it.id }).containsExactly("m1")
        assertThat(removed.deck.selectedSlide.mediaIds).containsExactly("m1")
        assertThat(removed.selectedSceneObject).isNull()
    }

    @Test
    fun `a duplicated place and a duplicated voice land offset, on top and selected`() {
        val place = StoryComposerObjectCopyReducer.duplicated(withPlace(), SceneObjectRef(ComposerObjectKind.PLACE, "l1"), "l2")
        val placeCopy = place.deck.selectedSlide.places.single { it.id == "l2" }
        assertThat(placeCopy.place).isEqualTo(paris)
        assertThat(placeCopy.x).isWithin(1e-9).of(0.35)
        assertThat(StorySceneStack.order(place.deck.selectedSlide).last()).isEqualTo(SceneObjectRef(ComposerObjectKind.PLACE, "l2"))
        assertThat(place.selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.PLACE, "l2"))

        val voice = StoryComposerObjectCopyReducer.duplicated(
            withVoice().let { it.copy(deck = it.deck.addPlaceToSelected(StoryLocationObject(id = "l9", place = paris))) },
            SceneObjectRef(ComposerObjectKind.AUDIO, "a1"),
            "a2",
        )
        val voiceCopy = voice.deck.selectedSlide.audio.single { it.id == "a2" }
        assertThat(voiceCopy.postMediaId).isEqualTo("pm-a1")
        assertThat(voiceCopy.y).isWithin(1e-9).of(0.75)
        assertThat(voice.deck.selectedSlide.soundSources["a2"]).isEqualTo(12f)
        assertThat(StorySceneStack.order(voice.deck.selectedSlide).last()).isEqualTo(SceneObjectRef(ComposerObjectKind.AUDIO, "a2"))
        assertThat(voice.selectedSceneObject).isEqualTo(SceneObjectRef(ComposerObjectKind.AUDIO, "a2"))
    }

    @Test
    fun `Time sets the window of a placed media, a place and a voice, in the fields the reader already plays`() {
        val media = StoryComposerSelectionReducer.mediaSelected(withPlacedPhoto(), "m1")
        val mediaTimed = StoryComposerObjectTimeReducer.durationCycled(StoryComposerObjectTimeReducer.startCycled(media, mediaRef("m1")), mediaRef("m1"))
        assertThat(mediaTimed.selectedObjectTiming).isEqualTo(StoryElementTiming(1f, 1f))
        val wire = StoryPublishPlacedMedia.resolve(mediaTimed.deck.selectedSlide, mediaTimed).single()
        assertThat(wire.startTime).isEqualTo(1.0)
        assertThat(wire.duration).isEqualTo(1.0)

        val placeRef = SceneObjectRef(ComposerObjectKind.PLACE, "l1")
        val place = StoryComposerObjectTimeReducer.startCycled(StoryComposerReferencesReducer.selected(withPlace(), "l1"), placeRef)
        assertThat(place.deck.selectedSlide.places.single().startTime).isEqualTo(1.0)
        assertThat(place.deck.selectedSlide.places.single().duration).isNull()

        val voiceRef = SceneObjectRef(ComposerObjectKind.AUDIO, "a1")
        val voice = StoryComposerObjectTimeReducer.durationCycled(StoryComposerSelectionReducer.soundSelected(withVoice(), "a1"), voiceRef)
        assertThat(voice.deck.selectedSlide.audio.single().duration).isEqualTo(1f)
    }

    @Test
    fun `the Time sheet stays open for every placed family, and never for a background`() {
        assertThat(StoryComposerSelectionReducer.mediaSelected(withPlacedPhoto(), "m1").serves(StoryComposerSheet.OBJECT_TIME)).isTrue()
        assertThat(StoryComposerReferencesReducer.selected(withPlace(), "l1").serves(StoryComposerSheet.OBJECT_TIME)).isTrue()
        assertThat(StoryComposerSelectionReducer.soundSelected(withVoice(), "a1").serves(StoryComposerSheet.OBJECT_TIME)).isTrue()
        val backdrop = StoryComposerSelectionReducer.mediaSelected(scene(StorySlide(id = "s", mediaIds = listOf("m1")), photo("m1")), "m1")
        assertThat(backdrop.serves(StoryComposerSheet.OBJECT_TIME)).isFalse()
    }

    @Test
    fun `a copy and its window survive the draft`() {
        val copied = StoryComposerObjectCopyReducer.duplicated(withPlacedPhoto(), mediaRef("m1"), "c1")
        val timed = StoryComposerObjectTimeReducer.startCycled(copied, mediaRef("c1"))

        val restored = timed.deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-31T00:00:00Z").toDeck()!!

        assertThat(restored.selectedSlide.placedMedia).isEqualTo(timed.deck.selectedSlide.placedMedia)
    }

    @Test
    fun `a published window is read back as the author's, never as the length a video plays by itself`() {
        val read = StoryPlacedMedia.foreground(
            listOf(
                me.meeshy.sdk.model.StoryMediaObject(id = "o1", postMediaId = "m1", startTime = 2.0, duration = 3.0),
                me.meeshy.sdk.model.StoryMediaObject(id = "o2", postMediaId = "m2", mediaType = "video", intrinsicDuration = 8.0, duration = 8.0),
            ),
        )

        assertThat(read.map { it.timing }).containsExactly(StoryElementTiming(2f, 3f), StoryElementTiming()).inOrder()
    }

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "en"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true), session, mockk<StoryMediaUploader>(relaxed = true), mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true), InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    @Test
    fun `removing the source of a copy from the bar keeps the copy and its file`() {
        val vm = viewModel()
        vm.onSceneReduce { StoryComposerObjectCopyReducer.duplicated(withPlacedPhoto(), mediaRef("m1"), "c1") }

        vm.onSelectionAction(mediaRef("m1"), REMOVE) {}

        assertThat(vm.state.value.deck.selectedSlide.placedMedia.map { it.id }).containsExactly("c1")
        assertThat(vm.state.value.deck.selectedSlide.mediaIds).containsExactly("m1")
        vm.onSelectionAction(mediaRef("c1"), REMOVE) {}
        assertThat(vm.state.value.deck.selectedSlide.placedMedia).isEmpty()
        assertThat(vm.state.value.deck.selectedSlide.mediaIds).isEmpty()
    }

    @Test
    fun `Duplicate and Time from the bar are undone and redone like any edit`() {
        val vm = viewModel()
        vm.onSceneReduce { StoryComposerSelectionReducer.mediaSelected(withPlacedPhoto(), "m1") }
        val noop: (StoryComposerSheet) -> Unit = {}

        vm.onSelectionAction(mediaRef("m1"), DUPLICATE, noop)
        val copy = vm.state.value.selectedMediaId!!
        assertThat(copy).isNotEqualTo("m1")
        assertThat(vm.state.value.deck.selectedSlide.placedMedia).hasSize(2)

        vm.onSceneReduce { StoryComposerObjectTimeReducer.startCycled(it, mediaRef(copy)) }
        assertThat(vm.state.value.selectedObjectTiming).isEqualTo(StoryElementTiming(1f, 0f))

        vm.onUndo()
        assertThat(vm.state.value.deck.selectedSlide.placedMedia.single { it.id == copy }.timing).isEqualTo(StoryElementTiming())
        vm.onUndo()
        assertThat(vm.state.value.deck.selectedSlide.placedMedia.map { it.id }).containsExactly("m1")
        vm.onRedo()
        vm.onRedo()
        assertThat(vm.state.value.deck.selectedSlide.placedMedia.single { it.id == copy }.timing).isEqualTo(StoryElementTiming(1f, 0f))
    }
}
