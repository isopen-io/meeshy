package me.meeshy.app.auth.guest

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.guest.GuestSessionEnd
import me.meeshy.sdk.net.GuestSessionEndSignal
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GuestSessionEndViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private class Fixture(purges: Boolean) {
        val signals = MutableSharedFlow<GuestSessionEndSignal>(extraBufferCapacity = 4)
        val socketErrors = MutableSharedFlow<String>(extraBufferCapacity = 4)
        val purgedTokens = mutableListOf<String?>()
        val viewModel = GuestSessionEndViewModel(
            ends = signals,
            socketErrors = socketErrors,
            purge = { token -> purgedTokens += token; purges },
        )
    }

    @Test
    fun `un refus REST purge la session refusee puis dit pourquoi`() = runTest(dispatcher) {
        val f = Fixture(purges = true)
        runCurrent()
        f.signals.emit(GuestSessionEndSignal(GuestSessionEnd.LINK_EXPIRED, "guest-1"))
        runCurrent()
        assertThat(f.purgedTokens).containsExactly("guest-1")
        assertThat(f.viewModel.ended.value?.end).isEqualTo(GuestSessionEnd.LINK_EXPIRED)
    }

    @Test
    fun `un refus que la purge ecarte ne montre aucun ecran`() = runTest(dispatcher) {
        val f = Fixture(purges = false)
        runCurrent()
        f.signals.emit(GuestSessionEndSignal(GuestSessionEnd.ACCESS_REVOKED, "old"))
        runCurrent()
        assertThat(f.viewModel.ended.value).isNull()
    }

    @Test
    fun `l evenement socket vise la session courante, sans jeton nomme`() = runTest(dispatcher) {
        val f = Fixture(purges = true)
        runCurrent()
        f.socketErrors.emit("""{"message":"x","code":"GUEST_ACCESS_REVOKED"}""")
        runCurrent()
        assertThat(f.purgedTokens).containsExactly(null)
        assertThat(f.viewModel.ended.value?.end).isEqualTo(GuestSessionEnd.ACCESS_REVOKED)
    }

    @Test
    fun `une erreur de socket ordinaire ne termine rien`() = runTest(dispatcher) {
        val f = Fixture(purges = true)
        runCurrent()
        f.socketErrors.emit("""{"code":"RATE_LIMIT"}""")
        runCurrent()
        assertThat(f.purgedTokens).isEmpty()
        assertThat(f.viewModel.ended.value).isNull()
    }

    @Test
    fun `fermer l ecran efface la fin`() = runTest(dispatcher) {
        val f = Fixture(purges = true)
        runCurrent()
        f.signals.emit(GuestSessionEndSignal(GuestSessionEnd.LINK_EXPIRED, null))
        runCurrent()
        f.viewModel.dismiss()
        assertThat(f.viewModel.ended.value).isNull()
    }
}
