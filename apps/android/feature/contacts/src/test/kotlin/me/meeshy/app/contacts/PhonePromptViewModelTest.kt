package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import app.cash.turbine.test
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ChangePhoneResponse
import me.meeshy.sdk.model.VerifyPhoneChangeResponse
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PhonePromptViewModelTest {

    @Before fun setUp() = Dispatchers.setMain(StandardTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private fun vm(users: UserRepository = mockk(relaxed = true), session: SessionRepository = mockk(relaxed = true)) =
        PhonePromptViewModel(users, session)

    private fun TestScope.sent(sut: PhonePromptViewModel, users: UserRepository) {
        coEvery { users.changePhone(any()) } returns NetworkResult.Success(ChangePhoneResponse(pendingPhoneNumber = "+33612345678"))
        sut.onEvent(PhonePromptEvent.NumberChanged("+33612345678"))
        sut.onEvent(PhonePromptEvent.SendCode)
        advanceUntilIdle()
    }

    @Test
    fun `un numero implausible n'envoie rien`() = runTest {
        val users = mockk<UserRepository>(relaxed = true)
        val sut = vm(users)
        sut.onEvent(PhonePromptEvent.NumberChanged("123"))
        sut.onEvent(PhonePromptEvent.SendCode)
        advanceUntilIdle()
        coVerify(exactly = 0) { users.changePhone(any()) }
        assertThat(sut.state.value.refusal).isNotNull()
    }

    @Test
    fun `l'envoi du code passe a l'etape du code`() = runTest {
        val users = mockk<UserRepository>(relaxed = true)
        val sut = vm(users)
        sent(sut, users)
        assertThat(sut.state.value.isCodeStep).isTrue()
        assertThat(sut.state.value.error).isNull()
    }

    @Test
    fun `un echec d'envoi reste a l'etape du numero avec une erreur`() = runTest {
        val users = mockk<UserRepository>(relaxed = true)
        coEvery { users.changePhone(any()) } returns NetworkResult.Failure(ApiError(message = "x", httpStatus = 500))
        val sut = vm(users)
        sut.onEvent(PhonePromptEvent.NumberChanged("+33612345678"))
        sut.onEvent(PhonePromptEvent.SendCode)
        advanceUntilIdle()
        assertThat(sut.state.value.isCodeStep).isFalse()
        assertThat(sut.state.value.error).isEqualTo(PhonePromptError.SEND_FAILED)
    }

    @Test
    fun `la verification rafraichit la session et annonce la fermeture`() = runTest {
        val users = mockk<UserRepository>(relaxed = true)
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { users.verifyPhoneChange("123456") } returns NetworkResult.Success(VerifyPhoneChangeResponse())
        val sut = vm(users, session)
        sent(sut, users)
        sut.onEvent(PhonePromptEvent.CodeChanged("12 34-56"))
        sut.onEvent(PhonePromptEvent.VerifyCode)
        advanceUntilIdle()
        coVerify { session.refresh() }
        sut.effects.test {
            assertThat(awaitItem()).isEqualTo(PhonePromptEffect.HapticSuccess)
            assertThat(awaitItem()).isEqualTo(PhonePromptEffect.HapticSuccess)
            assertThat(awaitItem()).isEqualTo(PhonePromptEffect.Verified)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `un 400 de verification dit code incorrect ou expire`() = runTest {
        val users = mockk<UserRepository>(relaxed = true)
        coEvery { users.verifyPhoneChange(any()) } returns NetworkResult.Failure(ApiError(message = "bad", httpStatus = 400))
        val sut = vm(users)
        sent(sut, users)
        sut.onEvent(PhonePromptEvent.CodeChanged("123456"))
        sut.onEvent(PhonePromptEvent.VerifyCode)
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(PhonePromptError.CODE_INVALID)
    }

    @Test
    fun `un autre echec de verification est generique`() = runTest {
        val users = mockk<UserRepository>(relaxed = true)
        coEvery { users.verifyPhoneChange(any()) } returns NetworkResult.Failure(ApiError(message = "boom", httpStatus = 500))
        val sut = vm(users)
        sent(sut, users)
        sut.onEvent(PhonePromptEvent.CodeChanged("123456"))
        sut.onEvent(PhonePromptEvent.VerifyCode)
        advanceUntilIdle()
        assertThat(sut.state.value.error).isEqualTo(PhonePromptError.GENERIC)
    }

    @Test
    fun `Modifier revient au numero sans reseau`() = runTest {
        val users = mockk<UserRepository>(relaxed = true)
        val sut = vm(users)
        sent(sut, users)
        sut.onEvent(PhonePromptEvent.EditNumber)
        assertThat(sut.state.value.isCodeStep).isFalse()
        assertThat(sut.state.value.flow.number).isEqualTo("+33612345678")
    }

    @Test
    fun `onContinue s'execute une seule fois quelle que soit la fermeture`() {
        val sut = vm()
        var count = 0
        sut.onClosed { count++ }
        sut.onClosed { count++ }
        assertThat(count).isEqualTo(1)
    }
}
