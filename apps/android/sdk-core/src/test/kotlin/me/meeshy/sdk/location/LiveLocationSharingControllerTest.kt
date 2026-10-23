package me.meeshy.sdk.location

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.LiveLocationDuration
import me.meeshy.sdk.model.LiveLocationFix
import me.meeshy.sdk.model.LiveLocationSharingState
import me.meeshy.sdk.model.LiveLocationStartFailure
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LiveLocationSharingControllerTest {
    private val fix = LiveLocationFix(48.0, 2.0)

    private class Rig(
        scope: TestScope,
        granted: Boolean = true,
        firstFix: LiveLocationFix? = LiveLocationFix(48.0, 2.0),
        online: Boolean = true,
    ) {
        val log = mutableListOf<String>()
        val stream = MutableSharedFlow<LiveLocationFix>(extraBufferCapacity = 8)
        val hostEvents = mutableListOf<String>()
        val controller = LiveLocationSharingController(
            sink = object : LiveLocationSink {
                override fun start(conversationId: String, fix: LiveLocationFix, duration: LiveLocationDuration): Boolean {
                    if (online) log += "start:$conversationId:${duration.minutes}"
                    return online
                }
                override fun update(conversationId: String, fix: LiveLocationFix): Boolean { log += "update:${fix.latitude}"; return true }
                override fun stop(conversationId: String): Boolean { log += "stop:$conversationId"; return true }
            },
            fixes = object : LiveLocationFixSource {
                override suspend fun currentFix() = firstFix
                override fun updates(intervalMillis: Long): Flow<LiveLocationFix> = stream
            },
            permission = LocationPermissionGate { granted },
            host = object : LiveLocationServiceHost {
                override fun onSharingStarted(conversationId: String, expiresAtMillis: Long) { hostEvents += "on" }
                override fun onSharingStopped() { hostEvents += "off" }
            },
            clock = LiveLocationClock { scope.currentTime },
            dispatcher = StandardTestDispatcher(scope.testScheduler),
        )
    }

    @Test
    fun `starting emits start then forwards updates then stops at expiry`() = runTest {
        val rig = Rig(this)
        rig.controller.start("c1", LiveLocationDuration.FIFTEEN_MINUTES)
        advanceTimeBy(1)
        assertThat(rig.controller.state.value).isInstanceOf(LiveLocationSharingState.Sharing::class.java)
        rig.stream.emit(LiveLocationFix(49.0, 3.0))
        advanceTimeBy(1)
        advanceTimeBy(LiveLocationDuration.FIFTEEN_MINUTES.durationMillis)
        assertThat(rig.log).containsExactly("start:c1:15", "update:49.0", "stop:c1").inOrder()
        assertThat(rig.controller.state.value).isEqualTo(LiveLocationSharingState.Idle)
        assertThat(rig.hostEvents).containsExactly("on", "off").inOrder()
    }

    @Test
    fun `manual stop emits stop and cancels the expiry`() = runTest {
        val rig = Rig(this)
        rig.controller.start("c1", LiveLocationDuration.ONE_HOUR)
        advanceTimeBy(1)
        rig.controller.stop()
        advanceTimeBy(LiveLocationDuration.ONE_HOUR.durationMillis)
        assertThat(rig.log).containsExactly("start:c1:60", "stop:c1").inOrder()
        assertThat(rig.controller.state.value).isEqualTo(LiveLocationSharingState.Idle)
    }

    @Test
    fun `a denied permission never starts the share and says why`() = runTest {
        val rig = Rig(this, granted = false)
        rig.controller.start("c1", LiveLocationDuration.DEFAULT)
        advanceTimeBy(1)
        assertThat(rig.controller.state.value)
            .isEqualTo(LiveLocationSharingState.Failed(LiveLocationStartFailure.PERMISSION_DENIED))
        assertThat(rig.log).isEmpty()
        assertThat(rig.hostEvents).isEmpty()
    }

    @Test
    fun `offline start fails without a foreground service`() = runTest {
        val rig = Rig(this, online = false)
        rig.controller.start("c1", LiveLocationDuration.DEFAULT)
        advanceTimeBy(1)
        assertThat(rig.controller.state.value)
            .isEqualTo(LiveLocationSharingState.Failed(LiveLocationStartFailure.OFFLINE))
        assertThat(rig.hostEvents).isEmpty()
    }

    @Test
    fun `no position fix fails the start`() = runTest {
        val rig = Rig(this, firstFix = null)
        rig.controller.start("c1", LiveLocationDuration.DEFAULT)
        advanceTimeBy(1)
        assertThat(rig.controller.state.value)
            .isEqualTo(LiveLocationSharingState.Failed(LiveLocationStartFailure.NO_FIX))
    }

    @Test
    fun `a server deadline shortens the share`() = runTest {
        val rig = Rig(this)
        rig.controller.start("c1", LiveLocationDuration.ONE_HOUR)
        advanceTimeBy(1)
        rig.controller.adoptServerDeadline(currentTime + 10_000)
        advanceTimeBy(10_001)
        assertThat(rig.log.last()).isEqualTo("stop:c1")
    }
}
