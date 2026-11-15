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
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.PostReferenceDisplay
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.composer.AudienceCandidate
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import me.meeshy.sdk.story.StoryDraftConfirmation
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Ce que la publication nomme, depuis « ⋯ » (#13846, iOS `StoryComposerViewModel+References` et `+StickersAndPlaces`) :
 * la mention ÉPINGLÉE est une pastille sur la scène, le hashtag s'écrit dans le texte et classe la publication, le lieu
 * est une pastille posée.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryComposerReferencesTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(): StoryComposerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        return StoryComposerViewModel(
            mockk<StoryRepository>(relaxed = true),
            session,
            mockk<StoryMediaUploader>(relaxed = true),
            mockk<MediaUploadQueue>(relaxed = true),
            mockk<WorkManager>(relaxed = true),
            InMemoryStoryComposerDraftStore(),
            mockk<MediaBlobStore>(relaxed = true),
            mockk<StoryDraftConfirmation>(relaxed = true),
        )
    }

    private val ana = AudienceCandidate(id = "507f1f77bcf86cd799439011", username = "ana", displayName = "Ana")
    private val bob = AudienceCandidate(id = "507f1f77bcf86cd799439012", username = "bob")
    private val cafe = SharedPlace(latitude = 48.86, longitude = 2.35, name = "Café de Flore", address = "Paris")

    private fun StoryComposerViewModel.plans() = publishPlans(state.value, "fr")

    @Test
    fun `a pinned mention is a badge on the scene that names its person, and is declared pinned`() {
        val vm = viewModel()
        vm.onMentionsChosen(listOf(ana), PostReferenceDisplay.PINNED)

        val badge = vm.state.value.deck.selectedSlide.elements.single()
        assertThat(badge.text).isEqualTo("@ana")
        assertThat(badge.referenceUserId).isEqualTo(ana.id)
        assertThat(badge.size).isEqualTo(StoryTextSize.SMALL)
        assertThat(badge.background).isInstanceOf(StoryTextBackground.Solid::class.java)
        assertThat(vm.state.value.draft.mentions).isEmpty()

        val request = vm.plans().single().request
        assertThat(request.storyEffects?.textObjects?.single()?.referenceUserId).isEqualTo(ana.id)
        assertThat(request.mentions).containsExactly(PostMentionInput(userId = ana.id, username = "ana", display = "PINNED"))
    }

    @Test
    fun `pinning the same person twice poses one badge, and two people cascade apart`() {
        val vm = viewModel()
        vm.onMentionsChosen(listOf(ana, bob), PostReferenceDisplay.PINNED)
        vm.onMentionsChosen(listOf(ana), PostReferenceDisplay.PINNED)

        val badges = vm.state.value.deck.selectedSlide.elements
        assertThat(badges.map { it.text }).containsExactly("@ana", "@bob").inOrder()
        assertThat(badges[1].y).isGreaterThan(badges[0].y)
    }

    @Test
    fun `a removed badge is no longer declared`() {
        val vm = viewModel()
        vm.onMentionsChosen(listOf(ana), PostReferenceDisplay.PINNED)
        vm.onRemoveTextElement(vm.state.value.deck.selectedSlide.elements.single().id)
        vm.onTextChange("Bonjour")

        assertThat(vm.plans().single().request.mentions).isNull()
    }

    @Test
    fun `a referenced or silent mention names the publication without posing anything`() {
        val vm = viewModel()
        vm.onMentionsChosen(listOf(ana), PostReferenceDisplay.NOTE)
        vm.onMentionsChosen(listOf(bob), PostReferenceDisplay.SILENT)

        assertThat(vm.state.value.deck.selectedSlide.elements).isEmpty()
        assertThat(vm.state.value.draft.mentions).containsExactly(
            PostMentionInput(userId = ana.id, username = "ana", display = "NOTE"),
            PostMentionInput(userId = bob.id, username = "bob", display = "SILENT"),
        ).inOrder()
    }

    @Test
    fun `choosing nobody changes nothing`() {
        val vm = viewModel()
        val before = vm.state.value
        vm.onMentionsChosen(emptyList(), PostReferenceDisplay.PINNED)
        assertThat(vm.state.value).isEqualTo(before)
    }

    @Test
    fun `a hashtag is written into the slide text, classes the publication, and toggles back out`() {
        val vm = viewModel()
        vm.onTextChange("Vacances")
        vm.onToggleHashtag("#voyage")

        assertThat(vm.state.value.deck.selectedSlide.text).isEqualTo("Vacances #voyage")
        assertThat(vm.state.value.hashtags).containsExactly("voyage")
        assertThat(vm.state.value.deck.selectedSlide.elements).isEmpty()

        vm.onToggleHashtag("Voyage")
        assertThat(vm.state.value.hashtags).isEmpty()
        assertThat(vm.state.value.deck.selectedSlide.text).isEqualTo("Vacances")
    }

    @Test
    fun `cancelling the hashtag sheet gives back exactly the hashtags it found`() {
        val vm = viewModel()
        vm.onTextChange("#mer")
        val before = vm.state.value.hashtags
        vm.onToggleHashtag("soleil")
        vm.onToggleHashtag("mer")
        vm.onRestoreHashtags(before)

        assertThat(vm.state.value.hashtags).containsExactly("mer")
    }

    @Test
    fun `a place is posed on the scene, selected, published as a place, and leaves through its selection bar`() {
        val vm = viewModel()
        vm.onPosePlace(cafe)

        val place = vm.state.value.deck.selectedSlide.places.single()
        assertThat(place.place).isEqualTo(cafe)
        assertThat(place.y).isEqualTo(0.8)
        assertThat(vm.state.value.canPublish).isTrue()
        assertThat(vm.plans().single().request.storyEffects?.locationObjects?.single()?.place).isEqualTo(cafe)

        val bar = vm.state.value.selectionBar!!
        assertThat(bar.ref).isEqualTo(SceneObjectRef(ComposerObjectKind.PLACE, place.id))
        assertThat(bar.actions).containsExactly(
            ComposerSelectionAction.EDIT, ComposerSelectionAction.DUPLICATE, ComposerSelectionAction.TIME, ComposerSelectionAction.REMOVE,
        ).inOrder()

        vm.onSelectionAction(bar.ref, ComposerSelectionAction.REMOVE) {}
        assertThat(vm.state.value.deck.selectedSlide.places).isEmpty()
        assertThat(vm.state.value.selectionBar).isNull()

        vm.onUndo()
        assertThat(vm.state.value.deck.selectedSlide.places).hasSize(1)
    }

    @Test
    fun `a dragged place moves within the scene, and touching the empty scene releases it`() {
        val vm = viewModel()
        vm.onPosePlace(cafe)
        val id = vm.state.value.deck.selectedSlide.places.single().id
        vm.onPlaceMoved(id, dx = -0.3f, dy = 0.5f)

        val moved = vm.state.value.deck.selectedSlide.places.single()
        assertThat(moved.x).isWithin(1e-6).of(0.2)
        assertThat(moved.y).isEqualTo(1.0)

        vm.onSceneBackgroundTap()
        assertThat(vm.state.value.selectionBar).isNull()
        vm.onSelectPlace(id)
        assertThat(vm.state.value.selectionBar?.ref?.id).isEqualTo(id)
    }

    @Test
    fun `a second place cascades above the first`() {
        val vm = viewModel()
        vm.onPosePlace(cafe)
        vm.onPosePlace(cafe.copy(name = "Gare"))
        val places = vm.state.value.deck.selectedSlide.places
        assertThat(places[1].y).isLessThan(places[0].y)
    }
    @Test
    fun `the mention sheet finds every person already named, the pinned one by its badge, each with its mode`() {
        val vm = viewModel()
        vm.onMentionsChosen(listOf(ana), PostReferenceDisplay.PINNED)
        vm.onMentionsChosen(listOf(bob), PostReferenceDisplay.SILENT)

        assertThat(vm.state.value.referenced).containsExactly(
            PostMentionInput(userId = ana.id, username = "ana", display = "PINNED"),
            PostMentionInput(userId = bob.id, username = "bob", display = "SILENT"),
        ).inOrder()
    }

    @Test
    fun `confirming the mention sheet removes who was taken out and re-modes who was kept`() {
        val vm = viewModel()
        vm.onMentionsChosen(listOf(ana), PostReferenceDisplay.PINNED)
        vm.onMentionsChosen(listOf(bob), PostReferenceDisplay.NOTE)

        vm.onReferencesEdited(
            kept = listOf(PostMentionInput(userId = bob.id, username = "bob", display = "SILENT")),
            added = emptyList(),
            display = PostReferenceDisplay.PINNED,
        )

        assertThat(vm.state.value.deck.selectedSlide.elements).isEmpty()
        assertThat(vm.state.value.referenced).containsExactly(PostMentionInput(userId = bob.id, username = "bob", display = "SILENT"))

        vm.onReferencesEdited(
            kept = listOf(PostMentionInput(userId = bob.id, username = "bob", display = "PINNED")),
            added = listOf(ana),
            display = PostReferenceDisplay.NOTE,
        )
        assertThat(vm.state.value.deck.selectedSlide.elements.single().referenceUserId).isEqualTo(bob.id)
        assertThat(vm.state.value.referenced).containsExactly(
            PostMentionInput(userId = bob.id, username = "bob", display = "PINNED"),
            PostMentionInput(userId = ana.id, username = "ana", display = "NOTE"),
        ).inOrder()
    }
}
