package me.meeshy.app.stories

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerPublicationViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val workManager: WorkManager = mockk(relaxed = true)
    private val media: StoryMediaUploader = mockk(relaxed = true)
    private val uploadQueue: MediaUploadQueue = mockk(relaxed = true)

    private fun viewModel(): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            repo, session, media, uploadQueue, workManager, InMemoryStoryComposerDraftStore(), mockk<MediaBlobStore>(relaxed = true),
        )
    }

    private fun uploaded(id: String, mime: String = "image/jpeg") = UploadedMedia(
        id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 1, height = 1, durationMs = null, thumbnailUrl = null,
    )

    private fun StoryComposerViewModel.published(): CreateStoryRequest {
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), any()) } returns "cmid"
        publish()
        return request.captured
    }

    private fun picked(vm: StoryComposerViewModel, vararg ids: String) {
        coEvery { media.upload(any()) } returns NetworkResult.Success(ids.map { uploaded(it) })
        vm.onMediaPicked(ids.map { me.meeshy.sdk.media.MediaUploadItem(byteArrayOf(1), "$it.jpg", "image/jpeg") })
    }

    @Test
    fun `l'audience nommee part avec sa liste, le mode et rien d'autre`() = runTest {
        val vm = viewModel()
        vm.onTextChange("salut")
        vm.onVisibilityChange(StoryVisibility.ONLY)
        vm.onAudienceUserIdsChange(listOf("a", "b"))

        val body = vm.published()

        assertThat(body.visibility).isEqualTo("ONLY")
        assertThat(body.visibilityUserIds).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `ONLY sans personne ne se publie pas`() = runTest {
        val vm = viewModel()
        vm.onTextChange("salut")
        vm.onVisibilityChange(StoryVisibility.ONLY)

        assertThat(vm.state.value.canPublish).isFalse()
        vm.onAudienceUserIdsChange(listOf("a"))
        assertThat(vm.state.value.canPublish).isTrue()
    }

    @Test
    fun `revenir a PUBLIC ne laisse partir aucune liste`() = runTest {
        val vm = viewModel()
        vm.onTextChange("salut")
        vm.onVisibilityChange(StoryVisibility.EXCEPT)
        vm.onAudienceUserIdsChange(listOf("a"))
        vm.onVisibilityChange(StoryVisibility.PUBLIC)

        assertThat(vm.published().visibilityUserIds).isNull()
    }

    @Test
    fun `une mention nommee part en NOTE, une fois, et se retire`() = runTest {
        val vm = viewModel()
        vm.onTextChange("salut")
        val ana = AudienceCandidate(id = "u1", username = "ana")
        vm.onAddMention(ana)
        vm.onAddMention(ana)
        assertThat(vm.state.value.draft.mentions).hasSize(1)

        vm.onRemoveMention("ana")
        assertThat(vm.state.value.draft.mentions).isEmpty()

        vm.onAddMention(ana)
        val body = vm.published()
        assertThat(body.mentions!!.single().userId).isEqualTo("u1")
        assertThat(body.mentions!!.single().display).isEqualTo("NOTE")
    }

    @Test
    fun `texte alternatif et legende partent par media, retirer le media purge ses descriptions`() = runTest {
        val vm = viewModel()
        picked(vm, "m1", "m2")
        vm.onMediaAltChange("m1", "un chat")
        vm.onMediaCaptionChange("m1", "Mon chat")
        vm.onMediaAltChange("m2", "un chien")

        vm.onRemoveMedia("m2")

        val body = vm.published()
        assertThat(body.mediaAlt).containsExactly("m1", "un chat")
        assertThat(body.mediaCaption).containsExactly("m1", "Mon chat")
    }

    @Test
    fun `les medias non decrits sont listes pour la slide`() = runTest {
        val vm = viewModel()
        picked(vm, "m1", "m2")
        vm.onMediaAltChange("m1", "un chat")

        assertThat(vm.state.value.undescribedMediaIds).containsExactly("m2")
    }

    @Test
    fun `l'extraction du son est un drapeau unique de la publication`() = runTest {
        val vm = viewModel()
        vm.onTextChange("salut")
        vm.onAllowSoundExtractionChange(true)

        assertThat(vm.published().allowSoundExtraction).isTrue()
    }

    @Test
    fun `les hashtags se lisent dans le texte de toutes les slides et se retirent partout`() = runTest {
        val vm = viewModel()
        vm.onTextChange("un #voyage")
        vm.onAddSlide()
        vm.onTextChange("encore #Voyage et #soleil")

        assertThat(vm.state.value.hashtags).containsExactly("voyage", "soleil").inOrder()

        vm.onRemoveHashtag("voyage")

        assertThat(vm.state.value.hashtags).containsExactly("soleil")
        assertThat(vm.state.value.deck.slides.map { it.text }).containsExactly("un", "encore et #soleil").inOrder()
    }

    @Test
    fun `le bouton nomme le nombre de stories qui partent`() = runTest {
        val vm = viewModel()
        vm.onTextChange("a")
        vm.onAddSlide()
        vm.onTextChange("b")

        assertThat(vm.state.value.publishTitle)
            .isEqualTo(me.meeshy.sdk.model.composer.StoryPublishTitle.Many(2))
    }
}
