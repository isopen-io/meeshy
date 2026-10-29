package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.model.presence.PresenceMap
import me.meeshy.sdk.model.presence.ServedPresencePage
import me.meeshy.sdk.model.profile.ProfileLivePresence
import me.meeshy.sdk.session.PerAccountCache
import org.junit.Test
import java.time.Instant

/**
 * La carte de présence au démarrage à froid (#13746) : semée par la page servie, relue du disque
 * (tant que son point se dessine, #13774), effacée au changement de compte, et jamais au profit d'un autre compte.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PresenceStorePersistenceTest {

    private val epoch = 1_700_000_000_000L
    private val hour = 3_600_000L
    private fun iso(ms: Long) = Instant.ofEpochMilli(ms).toString()

    private class FakePersistence : PresenceMapPersistence {
        var file: Pair<String, PresenceMap>? = null
        var saves = 0
        var clears = 0
        var gate: CompletableDeferred<Unit>? = null

        override suspend fun load(accountId: String): PresenceMap {
            gate?.await()
            return file?.takeIf { it.first == accountId }?.second.orEmpty()
        }

        override suspend fun save(accountId: String, entries: PresenceMap) {
            file = accountId to entries
            saves++
        }

        override suspend fun clear() {
            file = null
            clears++
        }
    }

    private class Fixture(scope: TestScope, epoch: Long, val disk: FakePersistence, var account: String?, session: String?) {
        val userStatus = MutableSharedFlow<UserStatusEvent>()
        val snapshot = MutableSharedFlow<PresenceSnapshotEvent>()
        val typing = MutableSharedFlow<me.meeshy.sdk.model.TypingEvent>()
        val connection = MutableStateFlow(SocketConnectionState.DISCONNECTED)
        val sessionUser = MutableStateFlow(session)
        val clock = object : CacheClock {
            override fun nowMillis(): Long = epoch + scope.currentTime
        }
        val store = PresenceStore(
            PresenceSources(userStatus, snapshot, typing, connection, sessionUser),
            clock,
            { account },
            StandardTestDispatcher(scope.testScheduler),
            persistence = disk,
        )
    }

    private fun TestScope.fixture(
        disk: FakePersistence = FakePersistence(),
        account: String? = "me",
        session: String? = account,
        start: Boolean = true,
    ) =
        Fixture(this, epoch, disk, account, session).also {
            if (start) it.store.start()
            testScheduler.runCurrent()
        }

    private fun TestScope.switchTo(f: Fixture, account: String?) {
        f.account = account
        f.sessionUser.value = account
        testScheduler.runCurrent()
    }

    @Test
    fun `the map is read back from the disk at start, before any socket event`() = runTest {
        val disk = FakePersistence().apply { file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 60_000))) }
        val f = fixture(disk)

        assertThat(f.store.entries.value["u1"]).isEqualTo(UserPresence(false, iso(epoch - 60_000)))
    }

    @Test
    fun `what was online when written is read back as no longer online, and keeps decaying`() = runTest {
        val disk = FakePersistence().apply { file = "me" to mapOf("u1" to UserPresence(true, iso(epoch - 30_000))) }
        val f = fixture(disk)

        assertThat(f.store.entries.value["u1"]).isEqualTo(UserPresence(false, iso(epoch - 30_000)))
    }

    @Test
    fun `an entry whose dot is already out is ignored on read`() = runTest {
        val disk = FakePersistence().apply {
            file = "me" to mapOf(
                "old" to UserPresence(false, iso(epoch - 25 * hour)),
                "hours" to UserPresence(false, iso(epoch - 2 * hour)),
                "ok" to UserPresence(false, iso(epoch - 4 * 60_000)),
            )
        }
        val f = fixture(disk)

        assertThat(f.store.entries.value.keys).containsExactly("ok")
    }

    @Test
    fun `a disk entry dated three hours ago never reaches the profile line, even when no page names the user`() = runTest {
        val disk = FakePersistence().apply { file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 3 * hour))) }
        val f = fixture(disk)

        val live = f.store.entryOf("u1").first()

        assertThat(ProfileLivePresence.line(live, null, null, f.clock.nowMillis())).isNull()
        assertThat(f.store.entries.value).doesNotContainKey("u1")
    }

    @Test
    fun `what was read back leaves the map and the disk when its dot goes out, without any page`() = runTest {
        val disk = FakePersistence().apply { file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 4 * 60_000))) }
        val f = fixture(disk)
        assertThat(f.store.entries.value).containsKey("u1")

        testScheduler.advanceTimeBy(61_000)
        testScheduler.runCurrent()
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.store.entryOf("u1").first()).isNull()
        assertThat(f.store.entries.value).doesNotContainKey("u1")
        assertThat(f.disk.file?.second.orEmpty()).doesNotContainKey("u1")
    }

    @Test
    fun `what the socket says before the read back expires is never expired with it`() = runTest {
        val disk = FakePersistence().apply { file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 4 * 60_000))) }
        val f = fixture(disk)
        f.userStatus.emit(UserStatusEvent("u1", "a", false, iso(epoch - 4 * 60_000)))
        testScheduler.runCurrent()

        testScheduler.advanceTimeBy(2 * 60_000)
        testScheduler.runCurrent()

        assertThat(f.store.entries.value).containsKey("u1")
    }

    @Test
    fun `a late read back never reinjects a user the served page already masked`() = runTest {
        val disk = FakePersistence().apply {
            file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 60_000)), "u2" to UserPresence(false, iso(epoch - 60_000)))
            gate = CompletableDeferred()
        }
        val f = fixture(disk)

        f.store.seed(ServedPresencePage(masked = setOf("u1")))
        disk.gate!!.complete(Unit)
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.store.entries.value).doesNotContainKey("u1")
        assertThat(f.store.entries.value).containsKey("u2")
        assertThat(f.disk.file?.second.orEmpty()).doesNotContainKey("u1")
    }

    @Test
    fun `an account adopted while the session teardown runs keeps a living map instead of a frozen one`() = runTest {
        val f = fixture(account = "A")
        switchTo(f, "B")

        (f.store as PerAccountCache).clear()
        f.userStatus.emit(UserStatusEvent("u7", "s", true, iso(epoch)))
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.store.entries.value.keys).containsExactly("u7")
        assertThat(f.disk.file?.first).isEqualTo("B")
        assertThat(f.disk.file?.second?.keys).containsExactly("u7")
    }

    @Test
    fun `a file written for another account is never read`() = runTest {
        val disk = FakePersistence().apply { file = "autre" to mapOf("u1" to UserPresence(false, iso(epoch - 1000))) }
        val f = fixture(disk)

        assertThat(f.store.entries.value).isEmpty()
    }

    @Test
    fun `the socket wins over what is read back, even when it speaks first`() = runTest {
        val disk = FakePersistence().apply {
            file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 120_000)), "u2" to UserPresence(false, iso(epoch - 120_000)))
            gate = CompletableDeferred()
        }
        val f = fixture(disk)
        f.userStatus.emit(UserStatusEvent("u1", "a", true, iso(epoch)))
        testScheduler.runCurrent()
        disk.gate!!.complete(Unit)
        testScheduler.runCurrent()

        assertThat(f.store.entries.value["u1"]).isEqualTo(UserPresence(true, iso(epoch)))
        assertThat(f.store.entries.value).containsKey("u2")
    }

    @Test
    fun `a served page seeds the unknown users only, never the current account`() = runTest {
        val f = fixture()
        f.userStatus.emit(UserStatusEvent("u1", "a", false, iso(epoch - 5000)))
        testScheduler.runCurrent()

        f.store.seed(
            mapOf(
                "u1" to UserPresence(true, iso(epoch - 90_000)),
                "u2" to UserPresence(true, iso(epoch - 10_000)),
                "me" to UserPresence(true, iso(epoch)),
            ),
        )

        assertThat(f.store.entries.value["u1"]).isEqualTo(UserPresence(false, iso(epoch - 5000)))
        assertThat(f.store.entries.value["u2"]).isEqualTo(UserPresence(true, iso(epoch - 10_000)))
        assertThat(f.store.entries.value).doesNotContainKey("me")
    }

    @Test
    fun `a seeded entry is written to the disk under the account, never the current account itself`() = runTest {
        val f = fixture()
        f.store.seed(mapOf("u2" to UserPresence(true, iso(epoch - 10_000)), "me" to UserPresence(true, iso(epoch))))
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        val written = f.disk.file
        assertThat(written?.first).isEqualTo("me")
        assertThat(written?.second?.keys).containsExactly("u2")
    }

    @Test
    fun `nothing is written when nothing changed since the read`() = runTest {
        val disk = FakePersistence().apply { file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 60_000))) }
        val f = fixture(disk)
        testScheduler.advanceTimeBy(10_000)
        testScheduler.runCurrent()

        assertThat(f.disk.saves).isEqualTo(0)
    }

    @Test
    fun `a burst of events is written at a bounded rate, with the latest state`() = runTest {
        val f = fixture()
        repeat(40) { i ->
            f.userStatus.emit(UserStatusEvent("u$i", "n$i", true, iso(epoch)))
            testScheduler.advanceTimeBy(100)
            testScheduler.runCurrent()
        }
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.disk.saves).isAtMost(4)
        assertThat(f.disk.file?.second).hasSize(40)
    }

    @Test
    fun `a sign out clears the map and the disk, and nothing received afterwards is kept or written`() = runTest {
        val disk = FakePersistence().apply { file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 60_000))) }
        val f = fixture(disk)
        val savesBefore = disk.saves

        switchTo(f, null)
        f.userStatus.emit(UserStatusEvent("u9", "z", true, iso(epoch)))
        f.typing.emit(me.meeshy.sdk.model.TypingEvent(conversationId = "c", userId = "u8"))
        f.store.noteActivity("u7")
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.store.entries.value).isEmpty()
        assertThat(f.disk.file).isNull()
        assertThat(f.disk.saves).isEqualTo(savesBefore)
    }

    @Test
    fun `switching account never shows account A under account B, on screen or on disk`() = runTest {
        val disk = FakePersistence().apply { file = "A" to mapOf("u1" to UserPresence(false, iso(epoch - 60_000))) }
        val f = fixture(disk, account = "A")
        assertThat(f.store.entries.value).containsKey("u1")

        switchTo(f, "B")
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.store.entries.value).isEmpty()
        assertThat(f.disk.file?.second.orEmpty()).doesNotContainKey("u1")
        assertThat(f.disk.file?.first).isNotEqualTo("A")
    }

    @Test
    fun `account B writes its own presence under its own key after the switch`() = runTest {
        val f = fixture(account = "A")
        switchTo(f, "B")
        f.userStatus.emit(UserStatusEvent("u7", "s", true, iso(epoch)))
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.disk.file?.first).isEqualTo("B")
        assertThat(f.disk.file?.second?.keys).containsExactly("u7")
    }

    @Test
    fun `what the socket of the account that left still delivers is never carried into the next account`() = runTest {
        val f = fixture()

        switchTo(f, null)
        f.userStatus.emit(UserStatusEvent("u9", "z", true, iso(epoch)))
        testScheduler.runCurrent()
        switchTo(f, "B")
        f.userStatus.emit(UserStatusEvent("u7", "s", true, iso(epoch)))
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.store.entries.value).doesNotContainKey("u9")
        assertThat(f.disk.file?.second.orEmpty()).doesNotContainKey("u9")
    }

    @Test
    fun `a cold start read back for A whose session is refused never reaches B`() = runTest {
        val disk = FakePersistence().apply { file = "A" to mapOf("u1" to UserPresence(false, iso(epoch - 60_000))) }
        val f = fixture(disk, account = "A", session = null)
        assertThat(f.store.entries.value).containsKey("u1")

        f.account = null
        f.userStatus.emit(UserStatusEvent("u9", "z", true, iso(epoch)))
        testScheduler.runCurrent()
        switchTo(f, "B")
        f.userStatus.emit(UserStatusEvent("u7", "s", true, iso(epoch)))
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.store.entries.value.keys).containsExactly("u7")
        assertThat(f.disk.file?.first).isEqualTo("B")
        assertThat(f.disk.file?.second?.keys).containsExactly("u7")
    }

    @Test
    fun `a read still running when the account leaves never reinjects what it read`() = runTest {
        val disk = FakePersistence().apply {
            file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 60_000)))
            gate = CompletableDeferred()
        }
        val f = fixture(disk)

        switchTo(f, null)
        switchTo(f, "me")
        disk.gate!!.complete(Unit)
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.store.entries.value).doesNotContainKey("u1")
        assertThat(f.disk.file?.second.orEmpty()).doesNotContainKey("u1")
    }

    @Test
    fun `the session teardown empties the map and the disk before it returns`() = runTest {
        val disk = FakePersistence().apply { file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 60_000))) }
        val f = fixture(disk)
        f.userStatus.emit(UserStatusEvent("u2", "b", true, iso(epoch)))
        testScheduler.runCurrent()

        val cache: PerAccountCache = f.store
        f.account = null
        cache.clear()

        assertThat(f.store.entries.value).isEmpty()
        assertThat(f.disk.file).isNull()
    }

    @Test
    fun `the session teardown waits for a read in flight, which then reinjects nothing`() = runTest {
        val disk = FakePersistence().apply {
            file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 60_000)))
            gate = CompletableDeferred()
        }
        val f = fixture(disk)
        f.account = null
        var wiped = false
        launch { (f.store as PerAccountCache).clear(); wiped = true }
        testScheduler.runCurrent()

        disk.gate!!.complete(Unit)
        testScheduler.runCurrent()

        assertThat(wiped).isTrue()
        assertThat(f.store.entries.value).isEmpty()
        assertThat(f.disk.file).isNull()
    }

    @Test
    fun `the teardown contributed to the session wipe empties the presence store`() = runTest {
        val disk = FakePersistence().apply { file = "me" to mapOf("u1" to UserPresence(false, iso(epoch - 60_000))) }
        val f = fixture(disk)
        f.account = null

        PresenceMapPersistenceModule.providePresenceAccountCache { f.store }.clear()

        assertThat(f.store.entries.value).isEmpty()
        assertThat(f.disk.file).isNull()
    }

    @Test
    fun `at cold start the served page wins over what was read back, and a masked row withdraws it`() = runTest {
        val disk = FakePersistence().apply {
            file = "me" to mapOf(
                "u1" to UserPresence(false, iso(epoch - 60_000)),
                "u2" to UserPresence(false, iso(epoch - 60_000)),
                "u3" to UserPresence(false, iso(epoch - 60_000)),
            )
        }
        val f = fixture(disk)
        f.userStatus.emit(UserStatusEvent("u3", "c", true, iso(epoch)))
        testScheduler.runCurrent()

        f.store.seed(
            ServedPresencePage(
                served = mapOf("u1" to UserPresence(false, iso(epoch - 600_000))),
                masked = setOf("u2", "u3"),
            ),
        )
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()

        assertThat(f.store.entries.value["u1"]).isEqualTo(UserPresence(false, iso(epoch - 600_000)))
        assertThat(f.store.entries.value).doesNotContainKey("u2")
        assertThat(f.store.entries.value["u3"]).isEqualTo(UserPresence(true, iso(epoch)))
        assertThat(f.disk.file?.second.orEmpty()).doesNotContainKey("u2")
    }
}
