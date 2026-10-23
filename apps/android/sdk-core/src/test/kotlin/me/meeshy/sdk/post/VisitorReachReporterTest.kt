package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.VisitorReachQueue
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.analytics.StampedSocialEvent
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VisitorReachReporterTest {

    private class MemoryStorage(var json: String? = null) : VisitorReachStorage {
        override fun read() = json
        override fun write(json: String?) { this.json = json }
    }

    private class FakeSender(var next: (List<StampedSocialEvent>) -> VisitorReachDelivery = { VisitorReachDelivery.ACKNOWLEDGED }) : VisitorReachSender {
        val sent = mutableListOf<Pair<List<String>, String>>()
        override suspend fun send(events: List<StampedSocialEvent>, token: String): VisitorReachDelivery {
            sent += events.map { it.postId } to token
            return next(events)
        }
    }

    private class Env(
        val scope: TestScope,
        val sender: FakeSender = FakeSender(),
        val storage: MemoryStorage = MemoryStorage(),
        var signedIn: Boolean = false,
        var tokens: List<String> = listOf("visitor_k"),
    ) {
        var counter = 0
        fun reporter() = VisitorReachReporter(
            sender = sender,
            storage = storage,
            token = { "visitor_k" },
            knownTokens = { tokens },
            isSignedIn = { signedIn },
            scope = scope.backgroundScope,
            nowMillis = { 1_000L },
            newEventId = { "id${counter++}" },
        )
    }

    private fun view(id: String) = SocialEvent.View(id)

    @Test
    fun `l'envoi part 2 s apres le premier evenement et pas avant`() = runTest {
        val env = Env(this)
        val reporter = env.reporter()
        reporter.record(listOf(view("a")))
        advanceTimeBy(1_999); runCurrent()
        assertThat(env.sender.sent).isEmpty()
        advanceTimeBy(2); runCurrent()
        assertThat(env.sender.sent).containsExactly(listOf("a") to "visitor_k")
        assertThat(reporter.pendingCount).isEqualTo(0)
        assertThat(env.storage.json).isNull()
    }

    @Test
    fun `le groupement repart du dernier evenement`() = runTest {
        val env = Env(this)
        val reporter = env.reporter()
        reporter.record(listOf(view("a")))
        advanceTimeBy(1_500)
        reporter.record(listOf(view("b")))
        advanceTimeBy(1_500); runCurrent()
        assertThat(env.sender.sent).isEmpty()
        advanceTimeBy(600); runCurrent()
        assertThat(env.sender.sent).containsExactly(listOf("a", "b") to "visitor_k")
    }

    @Test
    fun `le retour du reseau et le premier plan vident la file`() = runTest {
        val env = Env(this)
        val reporter = env.reporter()
        val reconnects = MutableSharedFlow<Unit>()
        val foreground = MutableSharedFlow<Unit>()
        reporter.start(reconnects, foreground)
        runCurrent()
        reporter.record(listOf(view("a")))
        reconnects.emit(Unit); runCurrent()
        assertThat(env.sender.sent).hasSize(1)
        reporter.record(listOf(view("b")))
        foreground.emit(Unit); runCurrent()
        assertThat(env.sender.sent).hasSize(2)
    }

    @Test
    fun `un echec conserve les evenements et le suivant les renvoie`() = runTest {
        val env = Env(this)
        env.sender.next = { VisitorReachDelivery.FAILED }
        val reporter = env.reporter()
        reporter.record(listOf(view("a")))
        advanceUntilIdle()
        assertThat(reporter.pendingCount).isEqualTo(1)
        assertThat(env.storage.json).isNotNull()
        env.sender.next = { VisitorReachDelivery.ACKNOWLEDGED }
        reporter.flushNow()
        assertThat(reporter.pendingCount).isEqualTo(0)
    }

    @Test
    fun `l'acquittement est partiel groupe par groupe`() = runTest {
        val env = Env(this)
        env.sender.next = { events ->
            if (events.first().event is SocialEvent.View) VisitorReachDelivery.ACKNOWLEDGED else VisitorReachDelivery.FAILED
        }
        val reporter = env.reporter()
        reporter.record(listOf(SocialEvent.Impression("i", "feed"), view("v")))
        advanceUntilIdle()
        assertThat(reporter.pendingCount).isEqualTo(1)
        assertThat(VisitorReachQueue.restore(env.storage.json).entries.single().stamped.event)
            .isInstanceOf(SocialEvent.Impression::class.java)
    }

    @Test
    fun `un refus definitif retire le lot sans rejeu`() = runTest {
        val env = Env(this)
        env.sender.next = { VisitorReachDelivery.REFUSED_PERMANENTLY }
        val reporter = env.reporter()
        reporter.record(listOf(view("a")))
        advanceUntilIdle()
        assertThat(reporter.pendingCount).isEqualTo(0)
    }

    @Test
    fun `le vidage est idempotent`() = runTest {
        val env = Env(this)
        val reporter = env.reporter()
        reporter.record(listOf(view("a")))
        reporter.flushNow()
        reporter.flushNow()
        assertThat(env.sender.sent).hasSize(1)
    }

    @Test
    fun `redemarrer restaure la file et la rejoue`() = runTest {
        val env = Env(this)
        env.sender.next = { VisitorReachDelivery.FAILED }
        env.reporter().record(listOf(view("a")))
        advanceUntilIdle()
        env.sender.next = { VisitorReachDelivery.ACKNOWLEDGED }
        val restarted = env.reporter()
        assertThat(restarted.pendingCount).isEqualTo(1)
        advanceUntilIdle()
        assertThat(restarted.pendingCount).isEqualTo(0)
    }

    @Test
    fun `aucun envoi ni mise en file pour un utilisateur connecte`() = runTest {
        val env = Env(this, signedIn = true)
        val reporter = env.reporter()
        reporter.record(listOf(view("a")))
        advanceUntilIdle()
        assertThat(reporter.pendingCount).isEqualTo(0)
        assertThat(env.sender.sent).isEmpty()
    }

    @Test
    fun `une cle purgee emporte les evenements qu'elle avait vus`() = runTest {
        val env = Env(this)
        env.sender.next = { VisitorReachDelivery.FAILED }
        val reporter = env.reporter()
        reporter.record(listOf(view("a")))
        advanceUntilIdle()
        env.tokens = emptyList()
        reporter.flushNow()
        assertThat(reporter.pendingCount).isEqualTo(0)
        assertThat(env.sender.sent.size).isEqualTo(1)
    }

    @Test
    fun `le disque ne contient jamais la cle`() = runTest {
        val env = Env(this)
        env.sender.next = { VisitorReachDelivery.FAILED }
        env.reporter().record(listOf(view("a")))
        advanceUntilIdle()
        assertThat(env.storage.json).doesNotContain("visitor_k")
    }
}
