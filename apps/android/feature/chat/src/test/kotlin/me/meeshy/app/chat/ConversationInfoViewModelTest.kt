package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.conversationinfo.ConversationTypeKind
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationInfoViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private fun row(muted: Boolean = false) =
        ApiConversation(id = "c1", type = "group", serverMemberCount = 3, preferences = ApiConversationPreferences(isMuted = muted))

    private fun viewModel(stream: MutableStateFlow<ApiConversation?>): ConversationInfoViewModel {
        val conversations = mockk<ConversationRepository>(relaxed = true)
        every { conversations.conversationStream("c1") } returns stream
        return ConversationInfoViewModel(conversations)
    }

    @Test
    fun `le heros attend la ligne puis la projette`() = runTest(dispatcher) {
        val stream = MutableStateFlow<ApiConversation?>(null)
        val vm = viewModel(stream)
        vm.start("c1")
        advanceUntilIdle()
        assertThat(vm.hero.value).isNull()
        stream.value = row()
        advanceUntilIdle()
        assertThat(vm.hero.value?.kind).isEqualTo(ConversationTypeKind.GROUP)
        assertThat(vm.hero.value?.memberCountLabel).isEqualTo("3")
    }

    @Test
    fun `le heros suit une ecriture venue d'ailleurs`() = runTest(dispatcher) {
        val stream = MutableStateFlow<ApiConversation?>(row(muted = false))
        val vm = viewModel(stream)
        vm.start("c1")
        advanceUntilIdle()
        assertThat(vm.hero.value?.muted).isFalse()
        stream.value = row(muted = true)
        advanceUntilIdle()
        assertThat(vm.hero.value?.muted).isTrue()
    }
}
