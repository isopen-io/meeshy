package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.FriendshipCache
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ContactsViewModelTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `default selected tab is Contacts`() = runTest {
        assertThat(ContactsViewModel(FriendshipCache()).state.value.selectedTab).isEqualTo(ContactsTab.Contacts)
    }

    @Test
    fun `selectTab updates selected tab`() = runTest {
        val vm = ContactsViewModel(FriendshipCache())

        vm.selectTab(ContactsTab.Requests)

        assertThat(vm.state.value.selectedTab).isEqualTo(ContactsTab.Requests)
    }

    @Test
    fun `the requests badge reads the friendship cache and follows it live`() = runTest {
        val cache = FriendshipCache()
        cache.didReceiveRequest("alice", "r1")
        val vm = ContactsViewModel(cache)
        assertThat(vm.state.value.pendingReceivedCount).isEqualTo(1)

        cache.didReceiveRequest("bob", "r2")
        assertThat(vm.state.value.pendingReceivedCount).isEqualTo(2)

        cache.didAcceptRequest("alice")
        assertThat(vm.state.value.pendingReceivedCount).isEqualTo(1)
    }
}
