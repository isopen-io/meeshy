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
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.ApiSoundUploader
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
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

    private val blocks = BlockCache()

    private fun viewModel(
        draftStore: InMemoryStoryComposerDraftStore = InMemoryStoryComposerDraftStore(),
        lookOven: StoryLookOven? = null,
    ): StoryComposerViewModel {
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            repo, session, media, uploadQueue, workManager, draftStore, mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true), blocks, lookOven = lookOven,
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
        coEvery { media.upload(any(), any()) } returns NetworkResult.Success(ids.map { uploaded(it) })
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
    fun `le brouillon garde jusqu'a la confirmation porte la liste nommee qui est partie`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val vm = viewModel(draftStore = store)
        vm.onTextChange("salut")
        vm.onVisibilityChange(StoryVisibility.ONLY)
        vm.onAudienceUserIdsChange(listOf("a", "b"))

        vm.published()

        val kept = store.load()
        assertThat(kept?.awaitingPublication).containsExactly("cmid")
        assertThat(kept?.visibility).isEqualTo("ONLY")
        assertThat(kept?.visibilityUserIds).containsExactly("a", "b").inOrder()
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

    @Test
    fun `une personne bloquee apres coup ne part ni dans la liste ni dans les mentions`() = runTest {
        val vm = viewModel()
        vm.onTextChange("salut")
        vm.onVisibilityChange(StoryVisibility.ONLY)
        vm.onAudienceUserIdsChange(listOf("a", "b"))
        vm.onAddMention(AudienceCandidate(id = "b", username = "bob"))
        vm.onAddMention(AudienceCandidate(id = "c", username = "cat"))
        blocks.setBlocked("b", true)

        val body = vm.published()

        assertThat(body.visibilityUserIds).containsExactly("a")
        assertThat(body.mentions!!.map { it.userId }).containsExactly("c")
    }

    @Test
    fun `une liste ONLY videe par un blocage ne part pas et redemande des personnes`() = runTest {
        val vm = viewModel()
        vm.onTextChange("salut")
        vm.onVisibilityChange(StoryVisibility.ONLY)
        vm.onAudienceUserIdsChange(listOf("b"))
        blocks.setBlocked("b", true)

        vm.publish()

        io.mockk.coVerify(exactly = 0) { repo.enqueuePublish(any(), any()) }
        assertThat(vm.state.value.draft.visibilityUserIds).isEmpty()
        assertThat(vm.state.value.canPublish).isFalse()
    }

    @Test
    fun `un brouillon ONLY restaure perd les personnes bloquees depuis et soi`() = runTest {
        blocks.setBlocked("b", true)
        val stored = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "salut")),
            selectedId = "s1",
            visibility = "ONLY",
            visibilityUserIds = listOf("a", "b", "me"),
        )
        val vm = viewModel(InMemoryStoryComposerDraftStore(stored))

        vm.onEnterComposer()

        assertThat(vm.state.value.draft.visibilityUserIds).containsExactly("a")
    }

    @Test
    fun `les mentions s'arretent au plafond de la passerelle`() = runTest {
        val vm = viewModel()
        vm.onTextChange("salut")
        (1..StoryComposerViewModel.MAX_MENTIONS + 3).forEach { vm.onAddMention(AudienceCandidate(id = "u$it", username = "user$it")) }

        assertThat(vm.published().mentions).hasSize(StoryComposerViewModel.MAX_MENTIONS)
    }

    @Test
    fun `une exclusion EXCEPT garde la personne bloquee depuis, seul soi en sort`() = runTest {
        val vm = viewModel()
        vm.onTextChange("salut")
        vm.onVisibilityChange(StoryVisibility.EXCEPT)
        vm.onAudienceUserIdsChange(listOf("a", "b", "me"))
        blocks.setBlocked("b", true)

        val body = vm.published()

        assertThat(body.visibility).isEqualTo("EXCEPT")
        assertThat(body.visibilityUserIds).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `un brouillon EXCEPT restaure garde ses exclusions bloquees, seul soi en sort`() = runTest {
        blocks.setBlocked("b", true)
        val stored = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "salut")),
            selectedId = "s1",
            visibility = "EXCEPT",
            visibilityUserIds = listOf("a", "b", "me"),
        )
        val vm = viewModel(InMemoryStoryComposerDraftStore(stored))

        vm.onEnterComposer()

        assertThat(vm.state.value.draft.visibilityUserIds).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `un son emprunte seul part par la voie durable avec son soundId, et le brouillon garde jusqu'a la confirmation le porte`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val vm = viewModel(draftStore = store)
        vm.onBorrowSound(
            ApiSound(id = "s1", title = "Pulse", fileUrl = "https://cdn/s1.m4a", durationMs = 6000, uploader = ApiSoundUploader("u", "belva")),
        )

        assertThat(vm.state.value.canPublish).isTrue()
        val body = vm.published()

        assertThat(body.storyEffects?.audioPlayerObjects?.single()?.soundId).isEqualTo("s1")
        val kept = store.load()
        assertThat(kept?.awaitingPublication).containsExactly("cmid")
        assertThat(kept?.slides?.single()?.audio?.single()?.soundId).isEqualTo("s1")
    }

    // ---- #13451 : les annotations voyagent avec le brouillon ----

    @Test
    fun `le brouillon garde jusqu'a la confirmation porte mentions, alt, legende et extraction du son`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val vm = viewModel(draftStore = store)
        picked(vm, "m1")
        vm.onAddMention(AudienceCandidate(id = "u1", username = "ana"))
        vm.onMediaAltChange("m1", "un chat")
        vm.onMediaCaptionChange("m1", "Minou")
        vm.onAllowSoundExtractionChange(false)

        vm.published()

        val annotations = store.load()?.annotations
        assertThat(annotations?.mentions?.map { it.username }).containsExactly("ana")
        assertThat(annotations?.mediaAlt).containsExactly("m1", "un chat")
        assertThat(annotations?.mediaCaption).containsExactly("m1", "Minou")
        assertThat(annotations?.allowSoundExtraction).isFalse()
    }

    @Test
    fun `un brouillon restaure retrouve ses annotations, sans celles d'un media disparu`() = runTest {
        val stored = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "salut", mediaIds = listOf("m1"))),
            selectedId = "s1",
            annotations = me.meeshy.sdk.model.StoryDraftAnnotations(
                mentions = listOf(me.meeshy.sdk.model.PostMentionInput(userId = "u1", username = "ana", display = "PINNED")),
                mediaAlt = mapOf("m1" to "un chat", "m9" to "disparu"),
                mediaCaption = mapOf("m1" to "Minou"),
                allowSoundExtraction = true,
            ),
        )
        val vm = viewModel(InMemoryStoryComposerDraftStore(stored))

        vm.onEnterComposer()

        val draft = vm.state.value.draft
        assertThat(draft.mentions.map { it.username }).containsExactly("ana")
        assertThat(draft.mediaAlt).containsExactly("m1", "un chat")
        assertThat(draft.mediaCaption).containsExactly("m1", "Minou")
        assertThat(draft.allowSoundExtraction).isTrue()
    }

    @Test
    fun `un brouillon restaure perd la mention d'une personne bloquee depuis`() = runTest {
        blocks.setBlocked("b", true)
        val stored = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "salut")),
            selectedId = "s1",
            annotations = me.meeshy.sdk.model.StoryDraftAnnotations(
                mentions = listOf(
                    me.meeshy.sdk.model.PostMentionInput(userId = "a", username = "ana", display = "PINNED"),
                    me.meeshy.sdk.model.PostMentionInput(userId = "b", username = "bob", display = "PINNED"),
                ),
            ),
        )
        val vm = viewModel(InMemoryStoryComposerDraftStore(stored))

        vm.onEnterComposer()

        assertThat(vm.state.value.draft.mentions.map { it.userId }).containsExactly("a")
    }

    @Test
    fun `un brouillon d'avant les annotations se restaure sans rien inventer`() = runTest {
        val stored = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "salut")),
            selectedId = "s1",
        )
        val vm = viewModel(InMemoryStoryComposerDraftStore(stored))

        vm.onEnterComposer()

        assertThat(vm.state.value.draft.mentions).isEmpty()
        assertThat(vm.state.value.draft.allowSoundExtraction).isNull()
    }

    @Test
    fun `l'autosave voit un changement d'annotation comme un changement de brouillon`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val vm = viewModel(draftStore = store)
        vm.onTextChange("salut")
        vm.persistDraft()
        vm.onAllowSoundExtractionChange(false)

        vm.persistDraft()

        assertThat(store.load()?.annotations?.allowSoundExtraction).isFalse()
    }

    // ---- #13430 : une porte qui apporte sa matière ne touche pas au brouillon de l'auteur ----

    private fun ownDraft() = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "mon brouillon")),
        selectedId = "s1",
    )

    @Test
    fun `un repost ne restaure pas le brouillon de l'auteur, et ne l'ecrase pas en partant`() = runTest {
        val store = InMemoryStoryComposerDraftStore(ownDraft())
        val vm = viewModel(store)

        vm.onRepostSource("src-1")
        vm.onEnterComposer(seededByDoor = true)
        vm.onTextChange("mon repost")
        vm.persistDraft()

        assertThat(vm.state.value.deck.selectedSlide.text).isEqualTo("mon repost")
        assertThat(store.load()?.slides?.single()?.text).isEqualTo("mon brouillon")
        assertThat(store.load()?.repostOfId).isNull()
    }

    @Test
    fun `un repost sans brouillon ecrit le sien, et peut ensuite le tenir a jour`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val vm = viewModel(store)
        vm.onRepostSource("src-1")
        vm.onEnterComposer(seededByDoor = true)

        vm.onTextChange("premier jet")
        vm.persistDraft()
        vm.onTextChange("second jet")
        vm.persistDraft()

        assertThat(store.load()?.slides?.single()?.text).isEqualTo("second jet")
        assertThat(store.load()?.repostOfId).isEqualTo("src-1")
    }

    @Test
    fun `publier un repost laisse le brouillon de l'auteur a sa place`() = runTest {
        val store = InMemoryStoryComposerDraftStore(ownDraft())
        val vm = viewModel(store)
        vm.onRepostSource("src-1")
        vm.onEnterComposer(seededByDoor = true)
        vm.onTextChange("mon repost")

        vm.published()

        assertThat(store.load()?.slides?.single()?.text).isEqualTo("mon brouillon")
        assertThat(store.load()?.isAwaitingPublication).isFalse()
    }

    @Test
    fun `une ouverture ordinaire restaure toujours le brouillon`() = runTest {
        val vm = viewModel(InMemoryStoryComposerDraftStore(ownDraft()))

        vm.onEnterComposer()

        assertThat(vm.state.value.deck.selectedSlide.text).isEqualTo("mon brouillon")
    }

    @Test
    fun `une story rouverte attend l'envoi encore en file de son media, qui n'est jamais televerse deux fois (#13500)`() = runTest {
        val queued = me.meeshy.sdk.outbox.OutboxIds.cmid()
        val blobs = mockk<MediaBlobStore>(relaxed = true)
        coEvery { blobs.has(queued) } returns true
        val reopened = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "ma story", mediaIds = listOf(queued))),
            selectedId = "s1",
            annotations = me.meeshy.sdk.model.StoryDraftAnnotations(mediaAlt = mapOf(queued to "un chat")),
        )
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        val vm = StoryComposerViewModel(
            repo, session, media, uploadQueue, workManager, InMemoryStoryComposerDraftStore(reopened), blobs,
            mockk<StoryDraftConfirmation>(relaxed = true), blocks,
        )
        vm.onEnterComposer()
        val dependsOn = slot<List<String>>()
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), capture(dependsOn)) } returns "cmid"

        vm.publish()

        assertThat(dependsOn.captured).containsExactly(queued)
        assertThat(request.captured.mediaAlt).containsExactly(queued, "un chat")
        io.mockk.coVerify(exactly = 0) { uploadQueue.enqueue(any(), any()) }
    }

    @Test
    fun `publier une image reglee part avec sa copie cuite, et le brouillon garde l original et son look`() = runTest {
        val store = InMemoryStoryComposerDraftStore()
        val copy = me.meeshy.sdk.media.MediaUploadItem(byteArrayOf(7), "story-look-m1.jpg", "image/jpeg")
        val queue: MediaUploadQueue = mockk { coEvery { enqueue(copy, me.meeshy.sdk.model.media.TusUploadContext.STORY) } returns "cmid-look" }
        val vm = viewModel(draftStore = store, lookOven = StoryLookOven({ copy }, queue, media))
        picked(vm, "m1")
        vm.onSceneReduce { StoryComposerLookReducer.chosen(it, "m1", me.meeshy.sdk.model.composer.look.ComposerLookStripItem.Filter(me.meeshy.sdk.model.call.VideoFilterPreset.Warm)) }
        val dependsOn = slot<List<String>>()
        val request = slot<CreateStoryRequest>()
        coEvery { repo.enqueuePublish(capture(request), capture(dependsOn)) } returns "story-cmid"

        vm.publish()

        assertThat(request.captured.mediaIds).containsExactly("cmid-look")
        assertThat(dependsOn.captured).containsExactly("cmid-look")
        assertThat(me.meeshy.sdk.net.MeeshyApi.json.encodeToString(CreateStoryRequest.serializer(), request.captured)).doesNotContain("filterPreset")
        val kept = store.load()!!.slides.single()
        assertThat(kept.mediaIds).containsExactly("m1")
        assertThat(kept.mediaLooks).containsExactly("m1", me.meeshy.sdk.model.StoryMediaLook(filterPreset = "warm"))
    }

    @Test
    fun `une image dont le look ne se cuit pas ne se publie pas en original`() = runTest {
        val vm = viewModel(lookOven = StoryLookOven({ null }, mockk(), media))
        picked(vm, "m1")
        vm.onSceneReduce { StoryComposerLookReducer.chosen(it, "m1", me.meeshy.sdk.model.composer.look.ComposerLookStripItem.Filter(me.meeshy.sdk.model.call.VideoFilterPreset.Warm)) }

        vm.publish()

        io.mockk.coVerify(exactly = 0) { repo.enqueuePublish(any(), any()) }
        assertThat(vm.state.value.isPublishing).isFalse()
        assertThat(vm.state.value.errorMessage).isNotNull()
        assertThat(vm.state.value.mediaLookOf("m1")).isEqualTo(me.meeshy.sdk.model.StoryMediaLook(filterPreset = "warm"))
    }
}
