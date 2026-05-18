package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.ConversationApi
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private class FakeConversationApi(
        var listResponse: ApiResponse<List<ApiConversation>>,
    ) : ConversationApi {
        override suspend fun list(offset: Int?, limit: Int?) = listResponse
        override suspend fun getById(id: String) = ApiResponse<ApiConversation>(success = false)
        override suspend fun create(body: CreateConversationRequest) =
            ApiResponse<ApiConversation>(success = false)
        override suspend fun markRead(id: String) = ApiResponse(success = true, data = Unit)
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun init_loadsConversations() = runTest(dispatcher) {
        val api = FakeConversationApi(
            ApiResponse(success = true, data = listOf(ApiConversation(id = "c1", title = "Team"))),
        )
        val vm = ConversationListViewModel(ConversationRepository(api))
        advanceUntilIdle()

        assertThat(vm.state.value.conversations).hasSize(1)
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun failure_surfacesErrorMessage() = runTest(dispatcher) {
        val api = FakeConversationApi(ApiResponse(success = false, error = "Server down"))
        val vm = ConversationListViewModel(ConversationRepository(api))
        advanceUntilIdle()

        assertThat(vm.state.value.errorMessage).isEqualTo("Server down")
        assertThat(vm.state.value.conversations).isEmpty()
    }
}
