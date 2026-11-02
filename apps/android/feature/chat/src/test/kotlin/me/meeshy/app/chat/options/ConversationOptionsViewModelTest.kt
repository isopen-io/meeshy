package me.meeshy.app.chat.options

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.conversation.ConversationPreferenceActions
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.PreferenceWrite
import me.meeshy.sdk.friend.BlockActionCoordinator
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Les Options de la fiche Conversation (#13777, iOS `ConversationOptionsViewModel`) : chaque geste
 * s'affiche dans l'image du toucher, s'écrit par l'écrivain partagé des préférences, se défait à
 * l'échec ; quitter, supprimer pour moi et bloquer referment la fiche une fois faits.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationOptionsViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private class Fixture(
        val vm: ConversationOptionsViewModel,
        val stream: MutableStateFlow<ApiConversation?>,
        val conversations: ConversationRepository,
        val preferences: ConversationPreferenceActions,
        val blocker: BlockActionCoordinator,
    )

    private fun conversation(type: String = "group", prefs: ApiConversationPreferences = ApiConversationPreferences()) =
        ApiConversation(id = "c1", identifier = "c1", type = type, isActive = true, currentUserRole = "member", preferences = prefs)

    private fun fixture(conversation: ApiConversation = conversation()): Fixture {
        val stream = MutableStateFlow<ApiConversation?>(conversation)
        val conversations = mockk<ConversationRepository>(relaxed = true)
        every { conversations.conversationStream("c1") } returns stream
        every { conversations.cachedConversations() } returns flowOf(
            listOf(conversation, ApiConversation(id = "c2", preferences = ApiConversationPreferences(tags = listOf("famille")))),
        )
        val categories = mockk<CategoryRepository>(relaxed = true)
        every { categories.categoriesStream(any(), any()) } returns flowOf(emptyList())
        val preferences = mockk<ConversationPreferenceActions>(relaxed = true)
        coEvery { preferences.setTags(any(), any()) } returns PreferenceWrite.Queued
        coEvery { preferences.setArchived(any(), any()) } returns PreferenceWrite.Queued
        val blocker = mockk<BlockActionCoordinator>(relaxed = true)
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(
            MeeshyUser(id = "me", username = "me", displayName = "Me", role = "USER", isAnonymous = false),
        )
        val vm = ConversationOptionsViewModel(conversations, categories, preferences, blocker, BlockCache(), session)
        return Fixture(vm, stream, conversations, preferences, blocker)
    }

    @Test
    fun `the cached preferences and the plan show without waiting for the network`() = runTest(dispatcher) {
        val f = fixture(conversation(prefs = ApiConversationPreferences(isPinned = true, tags = listOf("work"))))

        f.vm.start("c1", peerUserId = null)
        advanceUntilIdle()

        val state = f.vm.state.value
        assertThat(state.values.isPinned).isTrue()
        assertThat(state.plan?.leaveGroup).isTrue()
        assertThat(state.knownTags).containsExactly("famille", "work").inOrder()
    }

    @Test
    fun `a toggle shows at once, before the write returns`() = runTest(dispatcher) {
        val f = fixture()
        val write = CompletableDeferred<PreferenceWrite>()
        coEvery { f.preferences.setPinned("c1", true) } coAnswers { write.await() }
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.setPinned(true)

        assertThat(f.vm.state.value.values.isPinned).isTrue()
        write.complete(PreferenceWrite.Queued)
        advanceUntilIdle()
        coVerify(exactly = 1) { f.preferences.setPinned("c1", true) }
    }

    @Test
    fun `a failed write rolls the display back and says so`() = runTest(dispatcher) {
        val f = fixture()
        coEvery { f.preferences.setMuted("c1", true) } returns PreferenceWrite.Failed("disk")
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.setMuted(true)
        advanceUntilIdle()

        assertThat(f.vm.state.value.values.isMuted).isFalse()
        assertThat(f.vm.state.value.error).isEqualTo(ConversationOptionsError.SAVE)
    }

    @Test
    fun `a queued write stays shown until the cached row carries it`() = runTest(dispatcher) {
        val f = fixture()
        coEvery { f.preferences.setMentionsOnly("c1", true) } returns PreferenceWrite.Queued
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.setMentionsOnly(true)
        advanceUntilIdle()
        assertThat(f.vm.state.value.values.mentionsOnly).isTrue()

        f.stream.value = conversation(prefs = ApiConversationPreferences(mentionsOnly = true))
        advanceUntilIdle()
        assertThat(f.vm.state.value.values.mentionsOnly).isTrue()
    }

    @Test
    fun `the custom name is written once the typing pauses`() = runTest(dispatcher) {
        val f = fixture()
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.editCustomName("Fa")
        advanceTimeBy(200)
        f.vm.editCustomName("Famille")
        assertThat(f.vm.state.value.customNameDraft).isEqualTo("Famille")
        advanceUntilIdle()

        coVerify(exactly = 0) { f.preferences.setCustomName("c1", "Fa") }
        coVerify(exactly = 1) { f.preferences.setCustomName("c1", "Famille") }
    }

    @Test
    fun `adding and removing a tag replaces the whole set in one write`() = runTest(dispatcher) {
        val f = fixture(conversation(prefs = ApiConversationPreferences(tags = listOf("work"))))
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.addTag(" famille ")
        runCurrent()
        assertThat(f.vm.state.value.values.tags).containsExactly("work", "famille").inOrder()
        f.vm.removeTag("work")
        advanceUntilIdle()

        coVerify { f.preferences.setTags("c1", listOf("work", "famille")) }
        coVerify { f.preferences.setTags("c1", listOf("famille")) }
    }

    @Test
    fun `removing the category shows the conversation uncategorized at once and writes the removal`() = runTest(dispatcher) {
        val f = fixture(conversation(prefs = ApiConversationPreferences(categoryId = "work")))
        val write = CompletableDeferred<PreferenceWrite>()
        coEvery { f.preferences.removeCategory("c1", "work") } coAnswers { write.await() }
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.removeCategory()
        runCurrent()

        assertThat(f.vm.state.value.values.categoryId).isNull()
        write.complete(PreferenceWrite.Queued)
        advanceUntilIdle()
        coVerify(exactly = 1) { f.preferences.removeCategory("c1", "work") }
    }

    @Test
    fun `a failed category removal puts the category back and says so`() = runTest(dispatcher) {
        val f = fixture(conversation(prefs = ApiConversationPreferences(categoryId = "work")))
        coEvery { f.preferences.removeCategory("c1", "work") } returns PreferenceWrite.Failed("disk")
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.removeCategory()
        advanceUntilIdle()

        assertThat(f.vm.state.value.values.categoryId).isEqualTo("work")
        assertThat(f.vm.state.value.error).isEqualTo(ConversationOptionsError.SAVE)
    }

    @Test
    fun `the archive confirmation toggles the archive`() = runTest(dispatcher) {
        val f = fixture(conversation(prefs = ApiConversationPreferences(isArchived = true)))
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.toggleArchive()
        advanceUntilIdle()

        coVerify { f.preferences.setArchived("c1", false) }
    }

    @Test
    fun `leaving closes the info once the gateway agreed`() = runTest(dispatcher) {
        val f = fixture()
        coEvery { f.conversations.leave("c1") } returns NetworkResult.Success(Unit)
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.leave()
        advanceUntilIdle()

        assertThat(f.vm.state.value.exit).isEqualTo(ConversationOptionsExit.LEFT)
    }

    @Test
    fun `a refused leave stays open and says so`() = runTest(dispatcher) {
        val f = fixture()
        coEvery { f.conversations.leave("c1") } returns NetworkResult.Failure(ApiError(message = "nope"))
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.leave()
        advanceUntilIdle()

        assertThat(f.vm.state.value.exit).isNull()
        assertThat(f.vm.state.value.error).isEqualTo(ConversationOptionsError.LEAVE)
    }

    @Test
    fun `deleting for me closes the info, a refusal says so`() = runTest(dispatcher) {
        val f = fixture()
        coEvery { f.conversations.deleteForMe("c1") } returns NetworkResult.Failure(ApiError(message = "nope")) andThen NetworkResult.Success(Unit)
        f.vm.start("c1", null)
        advanceUntilIdle()

        f.vm.deleteForMe()
        advanceUntilIdle()
        assertThat(f.vm.state.value.error).isEqualTo(ConversationOptionsError.DELETE)

        f.vm.deleteForMe()
        advanceUntilIdle()
        assertThat(f.vm.state.value.exit).isEqualTo(ConversationOptionsExit.DELETED)
    }

    @Test
    fun `blocking the peer of a direct conversation goes through the shared coordinator`() = runTest(dispatcher) {
        val f = fixture(conversation(type = "direct"))
        f.vm.start("c1", peerUserId = "peer")
        advanceUntilIdle()
        assertThat(f.vm.state.value.plan?.blockUserId).isEqualTo("peer")

        f.vm.blockPeer()
        advanceUntilIdle()

        coVerify { f.blocker.block("peer") }
        assertThat(f.vm.state.value.exit).isEqualTo(ConversationOptionsExit.BLOCKED)
    }
}
