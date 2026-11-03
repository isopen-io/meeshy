package me.meeshy.sdk.notification

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UnreadBadgeCoordinatorTest {

    private class RecordingSink : UnreadBadgeSink {
        val published = mutableListOf<UnreadBadgeState>()
        var resets = 0
        override suspend fun publish(state: UnreadBadgeState) { published += state }
        override suspend fun reset() { resets++ }
    }

    private class Rig(scope: TestScope) {
        val cache = MutableStateFlow<Map<String, Int>>(emptyMap())
        val server = MutableSharedFlow<Pair<String, Int>>(extraBufferCapacity = 16)
        val reads = MutableSharedFlow<String>(extraBufferCapacity = 16)
        val bell = MutableStateFlow(0)
        val badges = MutableStateFlow(true)
        val open = MutableStateFlow<String?>(null)
        val sink = RecordingSink()
        val coordinator = UnreadBadgeCoordinator(cache, server, reads, bell, badges, open, setOf(sink))
            .also { it.start(scope.backgroundScope) }
    }

    @Test
    fun `une rafale d'evenements produit une seule ecriture apres 150 ms`() = runTest {
        val rig = Rig(this)
        runCurrent()
        rig.server.emit("c1" to 1)
        rig.server.emit("c1" to 2)
        rig.server.emit("c2" to 3)
        advanceTimeBy(149)
        assertThat(rig.sink.published).isEmpty()
        advanceTimeBy(2)
        assertThat(rig.sink.published).hasSize(1)
        assertThat(rig.sink.published.single().total).isEqualTo(5)
    }

    @Test
    fun `un compteur identique n'ecrit rien`() = runTest {
        val rig = Rig(this)
        runCurrent()
        rig.server.emit("c1" to 2)
        advanceTimeBy(200)
        rig.server.emit("c1" to 2)
        advanceTimeBy(200)
        assertThat(rig.sink.published).hasSize(1)
    }

    @Test
    fun `un reveil a froid sans instantane autoritaire ne publie aucun zero`() = runTest {
        val rig = Rig(this)
        advanceTimeBy(500)
        assertThat(rig.sink.published).isEmpty()
        assertThat(rig.coordinator.state.value.seeded).isFalse()
    }

    @Test
    fun `un push portant le compteur met le total a jour`() = runTest {
        val rig = Rig(this)
        runCurrent()
        rig.coordinator.onServerUnread("c1", 7)
        advanceTimeBy(200)
        assertThat(rig.coordinator.state.value.total).isEqualTo(7)
    }

    @Test
    fun `la preference Badges coupee met l'icone a zero mais garde le total et la cloche`() = runTest {
        val rig = Rig(this)
        rig.badges.value = false
        rig.bell.value = 4
        runCurrent()
        rig.server.emit("c1" to 6)
        advanceTimeBy(200)
        val state = rig.coordinator.state.value
        assertThat(state.iconCount).isEqualTo(0)
        assertThat(state.total).isEqualTo(6)
        assertThat(state.bell).isEqualTo(4)
    }

    @Test
    fun `la conversation ouverte n'est pas comptee et une lecture locale est optimiste`() = runTest {
        val rig = Rig(this)
        runCurrent()
        rig.server.emit("c1" to 3)
        rig.server.emit("c2" to 2)
        rig.open.value = "c1"
        advanceTimeBy(200)
        assertThat(rig.coordinator.state.value.total).isEqualTo(2)
        rig.reads.emit("c2")
        advanceTimeBy(200)
        assertThat(rig.coordinator.state.value.total).isEqualTo(0)
    }

    @Test
    fun `l'instantane du cache seme sans regresser le socket`() = runTest {
        val rig = Rig(this)
        runCurrent()
        rig.server.emit("c1" to 1)
        rig.cache.value = mapOf("c1" to 9, "c2" to 2)
        advanceTimeBy(200)
        assertThat(rig.coordinator.state.value.total).isEqualTo(3)
    }

    @Test
    fun `la deconnexion remet tout a zero et efface les puits`() = runTest {
        val rig = Rig(this)
        runCurrent()
        rig.server.emit("c1" to 5)
        advanceTimeBy(200)
        rig.coordinator.clear()
        assertThat(rig.coordinator.state.value.total).isEqualTo(0)
        assertThat(rig.sink.resets).isEqualTo(1)
        rig.cache.value = mapOf("c3" to 4)
        advanceTimeBy(200)
        assertThat(rig.coordinator.state.value.total).isEqualTo(4)
    }
}
