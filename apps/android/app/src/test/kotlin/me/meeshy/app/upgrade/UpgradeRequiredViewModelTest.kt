package me.meeshy.app.upgrade

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.net.UpgradeRequirement
import me.meeshy.sdk.net.UpgradeRequiredNotifier
import me.meeshy.sdk.socket.SocketServerError
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UpgradeRequiredViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private class Fixture {
        val notifier = UpgradeRequiredNotifier()
        val socketErrors = MutableSharedFlow<SocketServerError>(extraBufferCapacity = 4)
        val viewModel = UpgradeRequiredViewModel(notifier, socketErrors)
    }

    private val served = UpgradeRequirement("2.1.0", "https://play.google.com/store/apps/details?id=me.meeshy.app")

    @Test
    fun `sans refus, aucun ecran`() = runTest(dispatcher) {
        val f = Fixture()
        runCurrent()
        assertThat(f.viewModel.requirement.value).isNull()
    }

    @Test
    fun `un 426 REST monte l ecran`() = runTest(dispatcher) {
        val f = Fixture()
        runCurrent()
        f.notifier.notifyRequired(served)
        runCurrent()
        assertThat(f.viewModel.requirement.value).isEqualTo(served)
    }

    @Test
    fun `un 426 REST arrive avant l hote n est pas perdu`() = runTest(dispatcher) {
        val notifier = UpgradeRequiredNotifier()
        notifier.notifyRequired(served)
        val viewModel = UpgradeRequiredViewModel(notifier, MutableSharedFlow())
        runCurrent()
        assertThat(viewModel.requirement.value).isEqualTo(served)
    }

    @Test
    fun `l evenement socket error UPGRADE_REQUIRED mene au meme ecran`() = runTest(dispatcher) {
        val f = Fixture()
        runCurrent()
        f.socketErrors.emit(
            SocketServerError("""{"code":"UPGRADE_REQUIRED","minVersion":"2.1.0","storeUrl":"https://play.google.com/store/apps/details?id=me.meeshy.app"}""", null),
        )
        runCurrent()
        assertThat(f.viewModel.requirement.value).isEqualTo(served)
    }

    @Test
    fun `une autre erreur socket ne ferme pas l application`() = runTest(dispatcher) {
        val f = Fixture()
        runCurrent()
        f.socketErrors.emit(SocketServerError("""{"code":"NEWCOMER_SLOW_MODE","retryAfter":4}""", null))
        f.socketErrors.emit(SocketServerError("pas du json", null))
        runCurrent()
        assertThat(f.viewModel.requirement.value).isNull()
    }

    @Test
    fun `la rupture est collante et une exigence nue n efface pas la servie`() = runTest(dispatcher) {
        val f = Fixture()
        runCurrent()
        f.notifier.notifyRequired(served)
        f.notifier.notifyRequired(UpgradeRequirement("", null))
        runCurrent()
        assertThat(f.viewModel.requirement.value).isEqualTo(served)
    }
}
