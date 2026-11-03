package me.meeshy.app.settings

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.lock.LockPinMode
import me.meeshy.sdk.model.lock.LockSectionAction
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SecurityLockViewModelTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private fun store(pin: String? = null, locks: List<String> = emptyList()): ConversationLockStore =
        InMemoryConversationLockStore().also { s ->
            pin?.let(s::setMasterPin)
            locks.forEach { s.setLock(it, "1234") }
        }

    private fun SecurityLockViewModel.type(pin: String) = pin.forEach { onEvent(SecurityLockUiEvent.Digit(it - '0')) }

    @Test
    fun `chaque action ouvre la feuille dans son mode`() = runTest {
        val sut = SecurityLockViewModel(store())
        sut.state.test {
            awaitItem()
            sut.onEvent(SecurityLockUiEvent.ActionTapped(LockSectionAction.CONFIGURE))
            assertThat(expectMostRecentItem().prompt?.mode).isEqualTo(LockPinMode.SETUP_MASTER_PIN)
        }
        val withPin = SecurityLockViewModel(store("123456", listOf("c1")))
        withPin.state.test {
            awaitItem()
            withPin.onEvent(SecurityLockUiEvent.ActionTapped(LockSectionAction.CHANGE))
            assertThat(expectMostRecentItem().prompt?.mode).isEqualTo(LockPinMode.CHANGE_MASTER_PIN)
            withPin.onEvent(SecurityLockUiEvent.ActionTapped(LockSectionAction.UNLOCK_ALL))
            assertThat(expectMostRecentItem().prompt?.mode).isEqualTo(LockPinMode.UNLOCK_ALL)
        }
    }

    @Test
    fun `une action masquee n ouvre rien`() = runTest {
        val sut = SecurityLockViewModel(store("123456", listOf("c1")))
        sut.state.test {
            awaitItem()
            sut.onEvent(SecurityLockUiEvent.ActionTapped(LockSectionAction.REMOVE))
            expectNoEvents()
        }
    }

    @Test
    fun `l etat suit le coffre en direct`() = runTest {
        val s = store("123456")
        val sut = SecurityLockViewModel(s)
        sut.state.test {
            assertThat(awaitItem().presentation.lockCount).isEqualTo(0)
            s.setLock("c1", "1234")
            val item = expectMostRecentItem()
            assertThat(item.presentation.lockCount).isEqualTo(1)
            assertThat(item.presentation.actions).contains(LockSectionAction.UNLOCK_ALL)
            s.removeLock("c1")
            assertThat(expectMostRecentItem().presentation.actions).contains(LockSectionAction.REMOVE)
        }
    }

    @Test
    fun `UNLOCK_ALL vide les verrous mais garde le code principal`() = runTest {
        val s = store("123456", listOf("c1", "c2"))
        val sut = SecurityLockViewModel(s)
        sut.state.test {
            awaitItem()
            sut.onEvent(SecurityLockUiEvent.ActionTapped(LockSectionAction.UNLOCK_ALL))
            sut.type("123456")
            val item = expectMostRecentItem()
            assertThat(item.prompt).isNull()
            assertThat(item.presentation.lockCount).isEqualTo(0)
            assertThat(item.presentation.hasMasterPin).isTrue()
        }
        assertThat(s.lockedConversationIds).isEmpty()
        assertThat(s.hasMasterPin()).isTrue()
    }

    @Test
    fun `la creation du code principal passe par la confirmation puis le pose`() = runTest {
        val s = store()
        val sut = SecurityLockViewModel(s)
        sut.state.test {
            awaitItem()
            sut.onEvent(SecurityLockUiEvent.ActionTapped(LockSectionAction.CONFIGURE))
            sut.type("246810")
            sut.type("246810")
            assertThat(expectMostRecentItem().presentation.hasMasterPin).isTrue()
        }
        assertThat(s.verifyMasterPin("246810")).isTrue()
    }

    @Test
    fun `un mauvais code principal garde la feuille ouverte avec une erreur`() = runTest {
        val s = store("123456")
        val sut = SecurityLockViewModel(s)
        sut.state.test {
            awaitItem()
            sut.onEvent(SecurityLockUiEvent.ActionTapped(LockSectionAction.REMOVE))
            sut.type("000000")
            val item = expectMostRecentItem()
            assertThat(item.prompt?.error).isNotNull()
        }
        assertThat(s.hasMasterPin()).isTrue()
    }

    @Test
    fun `fermer la feuille l abandonne`() = runTest {
        val sut = SecurityLockViewModel(store())
        sut.state.test {
            awaitItem()
            sut.onEvent(SecurityLockUiEvent.ActionTapped(LockSectionAction.CONFIGURE))
            sut.onEvent(SecurityLockUiEvent.DismissPrompt)
            assertThat(expectMostRecentItem().prompt).isNull()
        }
    }
}
