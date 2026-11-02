package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.BirthDateDeclaration
import me.meeshy.sdk.model.BirthDateDeclarationError
import me.meeshy.sdk.user.BirthDateOutcome
import me.meeshy.sdk.user.BirthDateRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BirthDateDeclarationViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private val day = 954_892_800_000L // 2000-04-05T00:00:00Z

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `nothing is sent before a day is picked`() = runTest(dispatcher) {
        val repository = mockk<BirthDateRepository>(relaxed = true)
        val sut = BirthDateDeclarationViewModel(repository)

        sut.onEvent(BirthDateDeclarationUiEvent.Submit)
        advanceUntilIdle()

        assertThat(sut.state.value.canSubmit).isFalse()
        coVerify(exactly = 0) { repository.setBirthDateFromPicker(any()) }
    }

    @Test
    fun `a picked day is sent once and a minor sees the write restriction`() = runTest(dispatcher) {
        val repository = mockk<BirthDateRepository>()
        coEvery { repository.setBirthDateFromPicker(day) } returns
            BirthDateOutcome.Declared(BirthDateDeclaration("minor", true))
        val sut = BirthDateDeclarationViewModel(repository)

        sut.onEvent(BirthDateDeclarationUiEvent.PickDay(day))
        assertThat(sut.state.value.pickedWireDay).isEqualTo("2000-04-05")
        sut.onEvent(BirthDateDeclarationUiEvent.Submit)
        sut.onEvent(BirthDateDeclarationUiEvent.Submit)
        advanceUntilIdle()

        assertThat(sut.state.value.isDeclared).isTrue()
        assertThat(sut.state.value.isWriteRestricted).isTrue()
        coVerify(exactly = 1) { repository.setBirthDateFromPicker(day) }
    }

    @Test
    fun `a refusal is kept classified and allows another try`() = runTest(dispatcher) {
        val repository = mockk<BirthDateRepository>()
        coEvery { repository.setBirthDateFromPicker(any()) } returns
            BirthDateOutcome.Refused(BirthDateDeclarationError.BELOW_MINIMUM_AGE)
        val sut = BirthDateDeclarationViewModel(repository)

        sut.onEvent(BirthDateDeclarationUiEvent.PickDay(day))
        sut.onEvent(BirthDateDeclarationUiEvent.Submit)
        advanceUntilIdle()

        assertThat(sut.state.value.error).isEqualTo(BirthDateDeclarationError.BELOW_MINIMUM_AGE)
        assertThat(sut.state.value.canSubmit).isTrue()
    }
}
