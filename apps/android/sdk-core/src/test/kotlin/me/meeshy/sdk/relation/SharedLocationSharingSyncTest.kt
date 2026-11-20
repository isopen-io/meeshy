package me.meeshy.sdk.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.location.LiveLocationFixSource
import me.meeshy.sdk.location.LocationPermissionGate
import me.meeshy.sdk.model.LiveLocationFix
import me.meeshy.sdk.model.relation.SharedLocationFix
import me.meeshy.sdk.model.relation.SharedLocationOwnRecipient
import me.meeshy.sdk.model.relation.SharedLocationOwnSnapshot
import me.meeshy.sdk.model.relation.SharedLocationOwnSnapshotWire
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationRoster
import me.meeshy.sdk.model.relation.SharedLocationSendOutcome
import me.meeshy.sdk.model.relation.SharedLocationShareDuration
import me.meeshy.sdk.model.relation.SharedLocationStartRequest
import me.meeshy.sdk.model.relation.SharedLocationStartVerdict
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/**
 * PLUSIEURS APPAREILS, UN PARTAGE (#18578, moitié Android), iso `SharedLocationSharingSyncTests.swift` : le centre se
 * recale sur la liste que la passerelle sert, et une liste REÇUE d'un autre appareil ne fait jamais partir la position
 * d'ici.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SharedLocationSharingSyncTest {

    private val alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private val hour = 3_600_000L

    /** Un appareil du compte « me » : son stockage survit à un « relancement » (un second centre sur le même stockage). */
    private class Device(
        private val scope: TestScope,
        val saved: MutableMap<String, String?> = mutableMapOf(),
        val receivedMarks: MutableMap<String, Boolean> = mutableMapOf(),
        val startMarks: MutableMap<String, String?> = mutableMapOf(),
    ) {
        var servedSnapshot: SharedLocationOwnSnapshot? = null
        var servedFailure: Exception? = null

        /** Une panne qu'on laisse courir rejoue la relecture toutes les 30 s pour toujours : `runTest`, qui avance
         * l'horloge virtuelle jusqu'au repos, ne finirait jamais. Le témoin la lève une fois ses assertions faites. */
        fun endOutage() {
            servedFailure = null
        }
        var servedGate: CompletableDeferred<Unit>? = null
        var account: String? = "me"
        val writes = mutableListOf<String>()
        var startVerdict: SharedLocationStartVerdict = SharedLocationStartVerdict.Started(0L)
        val connected = MutableStateFlow(false)
        val ownChanged = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
        val starts = mutableListOf<SharedLocationStartRequest>()
        val updates = mutableListOf<SharedLocationFix>()
        var stops = 0
        var reads = 0
        var fixAsks = 0
        val queuedStartVerdicts = ArrayDeque<SharedLocationStartVerdict>()
        var following = 0
        val stream = MutableSharedFlow<LiveLocationFix>(extraBufferCapacity = 8)

        val center = SharedLocationSharingCenter(
            emitter = object : SharedLocationEmitting {
                override suspend fun start(request: SharedLocationStartRequest): SharedLocationStartVerdict {
                    starts += request
                    return queuedStartVerdicts.removeFirstOrNull() ?: startVerdict
                }
                override suspend fun update(fix: SharedLocationFix): SharedLocationStartVerdict {
                    updates += fix
                    return SharedLocationStartVerdict.Started(0L)
                }
                override suspend fun stop(): Boolean {
                    stops++
                    return true
                }
            },
            fixes = object : LiveLocationFixSource {
                override suspend fun currentFix(): LiveLocationFix {
                    fixAsks++
                    return LiveLocationFix(48.8566, 2.3522, accuracy = 8.0)
                }
                override fun updates(intervalMillis: Long): Flow<LiveLocationFix> {
                    following++
                    return stream
                }
            },
            permission = LocationPermissionGate { true },
            store = object : SharedLocationRosterStoring {
                override fun load(accountId: String): String? = saved[accountId]
                override fun save(accountId: String, stored: String?) {
                    writes += "roster:$accountId"
                    saved[accountId] = stored
                }
                override fun loadReceived(accountId: String): Boolean = receivedMarks[accountId] == true
                override fun saveReceived(accountId: String, received: Boolean) {
                    writes += "received:$accountId=$received"
                    receivedMarks[accountId] = received
                }
                override fun loadPublishedStart(accountId: String): String? = startMarks[accountId]
                override fun savePublishedStart(accountId: String, startedAt: String?) {
                    startMarks[accountId] = startedAt
                }
            },
            accountId = { account },
            connected = connected,
            clock = { scope.currentTime },
            dispatcher = StandardTestDispatcher(scope.testScheduler),
            ownChanged = ownChanged,
            served = {
                reads++
                servedGate?.await()
                servedFailure?.let { throw it }
                servedSnapshot
            },
        )

        fun relaunched(): Device = Device(scope, saved, receivedMarks, startMarks)
    }

    private fun served(vararg pairs: Pair<String, Long>) =
        SharedLocationOwnSnapshot(pairs.map { (id, until) -> SharedLocationOwnRecipient(id, SharedLocationPrecision.CITY, until) })

    @Test
    fun `un retrait fait sur un autre appareil s'applique ici a la socket accrochee, sans republier`() = runTest {
        val device = Device(this)
        runCurrent()
        device.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS)
        device.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS)
        val startsBefore = device.starts.size
        device.servedSnapshot = served(alice to 8 * hour)

        device.connected.value = true
        runCurrent()

        assertThat(device.center.roster.value.entry(bob)).isNull()
        assertThat(device.center.roster.value.entry(alice)).isNotNull()
        assertThat(device.starts).hasSize(startsBefore)
        assertThat(device.stops).isEqualTo(0)
    }

    @Test
    fun `un ajout fait ailleurs, annonce, n'est plus efface par le partage suivant d'ici`() = runTest {
        val device = Device(this)
        runCurrent()
        device.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        device.servedSnapshot = served(alice to hour, bob to 2 * hour)

        device.ownChanged.emit(Unit)
        runCurrent()
        device.center.share(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.ONE_HOUR)

        assertThat(device.starts.last().recipients.map { it.userId }).containsExactly(alice, bob)
    }

    @Test
    fun `une relecture qui echoue ne change rien`() = runTest {
        val device = Device(this)
        runCurrent()
        device.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        val before = device.center.roster.value
        device.servedSnapshot = null

        device.ownChanged.emit(Unit)
        runCurrent()

        assertThat(device.reads).isEqualTo(1)
        assertThat(device.center.roster.value).isEqualTo(before)
    }

    @Test
    fun `la passerelle ne sert plus rien, le suivi s'arrete ici`() = runTest {
        val device = Device(this)
        runCurrent()
        device.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        device.servedSnapshot = served()

        device.ownChanged.emit(Unit)
        runCurrent()
        device.stream.emit(LiveLocationFix(48.9, 2.4, accuracy = 8.0))
        advanceTimeBy(60_000L)
        runCurrent()

        assertThat(device.center.roster.value.isEmpty).isTrue()
        assertThat(device.saved["me"]).isNull()
        assertThat(device.updates).isEmpty()
    }

    @Test
    fun `une liste recue d'un autre appareil ne fait jamais partir la position d'ici, meme apres relancement`() = runTest {
        val device = Device(this)
        runCurrent()
        device.servedSnapshot = served(alice to hour)

        device.ownChanged.emit(Unit)
        runCurrent()

        assertThat(device.center.roster.value.entry(alice)).isNotNull()
        assertThat(device.following).isEqualTo(0)
        assertThat(device.receivedMarks["me"]).isTrue()

        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()
        assertThat(relaunched.center.roster.value.entry(alice)).isNotNull()
        assertThat(relaunched.following).isEqualTo(0)
        assertThat(relaunched.starts + device.starts).isEmpty()
    }

    @Test
    fun `l'echeance d'une liste recue se solde sans rien envoyer`() = runTest {
        val device = Device(this)
        runCurrent()
        device.servedSnapshot = served(alice to hour)
        device.ownChanged.emit(Unit)
        runCurrent()

        advanceTimeBy(hour + 2_000L)
        runCurrent()

        assertThat(device.center.roster.value.isEmpty).isTrue()
        assertThat(device.starts).isEmpty()
        assertThat(device.stops).isEqualTo(0)
        assertThat(device.receivedMarks["me"]).isFalse()
    }

    @Test
    fun `partager depuis ici fait de cet appareil celui qui publie`() = runTest {
        val device = Device(this)
        runCurrent()
        device.servedSnapshot = served(alice to hour)
        device.ownChanged.emit(Unit)
        runCurrent()

        device.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()

        assertThat(device.starts.single().recipients.map { it.userId }).containsExactly(alice, bob)
        assertThat(device.receivedMarks["me"]).isFalse()
        assertThat(device.following).isEqualTo(1)
    }

    @Test
    fun `un partage refuse sur un appareil qui n'a fait que recevoir le laisse muet, meme apres relancement`() = runTest {
        val device = Device(this)
        runCurrent()
        device.servedSnapshot = served(alice to hour)
        device.ownChanged.emit(Unit)
        runCurrent()
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.RATE_LIMITED)

        device.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()

        assertThat(device.receivedMarks["me"]).isTrue()
        assertThat(device.following).isEqualTo(0)
        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()
        assertThat(relaunched.following).isEqualTo(0)
    }

    @Test
    fun `la marque recue s'ecrit avant la liste recue, un processus tue entre les deux se relance muet`() = runTest {
        val device = Device(this)
        runCurrent()
        device.servedSnapshot = served(alice to hour)

        device.ownChanged.emit(Unit)
        runCurrent()

        assertThat(device.writes).containsExactly("received:me=true", "roster:me").inOrder()
    }

    @Test
    fun `une relecture qui leve ne tue pas la reconciliation des reconnexions suivantes`() = runTest {
        val device = Device(this)
        runCurrent()
        device.servedFailure = IllegalStateException("convertisseur")
        device.connected.value = true
        runCurrent()
        device.connected.value = false
        runCurrent()

        device.servedFailure = null
        device.servedSnapshot = served(alice to hour)
        device.connected.value = true
        runCurrent()

        assertThat(device.reads).isEqualTo(2)
        assertThat(device.center.roster.value.entry(alice)).isNotNull()
    }

    @Test
    fun `une relecture en vol pendant un changement de compte n'ecrit rien pour personne`() = runTest {
        val device = Device(this)
        runCurrent()
        device.center.restore()
        runCurrent()
        device.servedGate = CompletableDeferred()
        device.servedSnapshot = served(alice to hour)
        device.ownChanged.emit(Unit)
        runCurrent()

        device.account = "other"
        device.center.clear()
        device.servedGate?.complete(Unit)
        runCurrent()

        assertThat(device.writes).isEmpty()
        assertThat(device.center.roster.value.isEmpty).isTrue()
    }

    @Test
    fun `un arreter hors ligne gagne sur la liste servie et part a la reconnexion`() = runTest {
        val device = Device(this)
        runCurrent()
        device.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS)
        device.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS)
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.OFFLINE)
        device.center.stopSharing(bob)
        assertThat(device.center.roster.value.isWithdrawalPending(bob)).isTrue()

        device.startVerdict = SharedLocationStartVerdict.Started(0L)
        device.servedSnapshot = served(alice to 8 * hour, bob to 8 * hour)
        device.connected.value = true
        runCurrent()

        assertThat(device.starts.last().recipients.map { it.userId }).containsExactly(alice)
        assertThat(device.center.roster.value.entry(bob)).isNull()
        assertThat(device.center.roster.value.hasPendingWithdrawals).isFalse()
    }

    @Test
    fun `retirer quelqu'un d'une liste recue envoie la liste seule, sans jamais demander la position d'ici`() = runTest {
        val device = Device(this)
        runCurrent()
        device.servedSnapshot = served(alice to hour, bob to hour)
        device.ownChanged.emit(Unit)
        runCurrent()

        val problem = device.center.stopSharing(bob)
        runCurrent()

        assertThat(problem).isNull()
        assertThat(device.fixAsks).isEqualTo(0)
        assertThat(device.starts.map { it.isListOnly }).containsExactly(true)
        assertThat(device.starts.single().recipients.map { it.userId }).containsExactly(alice)
        assertThat(device.following).isEqualTo(0)
        assertThat(device.receivedMarks["me"]).isTrue()
        assertThat(device.center.roster.value.entry(bob)).isNull()
    }

    @Test
    fun `une liste seule sans partage alors que la passerelle sert encore quelqu'un garde le retrait en attente`() = runTest {
        val device = Device(this)
        runCurrent()
        device.servedSnapshot = served(alice to hour, bob to hour)
        device.ownChanged.emit(Unit)
        runCurrent()
        device.queuedStartVerdicts += SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.NOT_SHARING)

        val problem = device.center.stopSharing(bob)

        assertThat(problem).isEqualTo(SharedLocationShareProblem.WithdrawalPending)
        assertThat(device.center.roster.value.isWithdrawalPending(bob)).isTrue()
        assertThat(device.center.roster.value.entry(alice)).isNotNull()
        assertThat(device.stops).isEqualTo(0)
        assertThat(device.fixAsks).isEqualTo(0)
    }

    @Test
    fun `une liste seule sans partage quand la passerelle ne sert plus personne vide la liste sans arreter`() = runTest {
        val device = Device(this)
        runCurrent()
        device.servedSnapshot = served(alice to hour, bob to hour)
        device.ownChanged.emit(Unit)
        runCurrent()
        device.queuedStartVerdicts += SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.NOT_SHARING)
        device.servedSnapshot = served()

        val problem = device.center.stopSharing(bob)

        assertThat(problem).isNull()
        assertThat(device.center.roster.value.isEmpty).isTrue()
        assertThat(device.stops).isEqualTo(0)
        assertThat(device.fixAsks).isEqualTo(0)
    }

    @Test
    fun `une liste seule sans partage suivie d'une relecture en echec garde le retrait en attente`() = runTest {
        val device = Device(this)
        runCurrent()
        device.servedSnapshot = served(alice to hour, bob to hour)
        device.ownChanged.emit(Unit)
        runCurrent()
        device.queuedStartVerdicts += SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.NOT_SHARING)
        device.servedSnapshot = null

        val problem = device.center.stopSharing(bob)

        assertThat(problem).isEqualTo(SharedLocationShareProblem.WithdrawalPending)
        assertThat(device.center.roster.value.isWithdrawalPending(bob)).isTrue()
        assertThat(device.center.roster.value.entry(alice)).isNotNull()
        assertThat(device.stops).isEqualTo(0)
    }

    private val mine = "2026-01-01T00:00:00.000Z"
    private val elsewhere = "2026-01-01T00:00:05.000Z"

    private fun servedFrom(startedAt: String?, vararg people: Pair<String, Long>) =
        SharedLocationOwnSnapshot(served(*people).recipients, startedAt)

    private suspend fun TestScope.publishing(device: Device) {
        runCurrent()
        device.startVerdict = SharedLocationStartVerdict.Started(hour, mine)
        device.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()
        assertThat(device.following).isEqualTo(1)
    }

    @Test
    fun `un autre demarrage servi fait ceder l'appareil qui publiait, aucun releve ne part plus`() = runTest {
        val device = Device(this)
        publishing(device)
        val sent = device.updates.size
        device.servedSnapshot = servedFrom(elsewhere, alice to hour, bob to hour)

        device.ownChanged.emit(Unit)
        runCurrent()
        advanceTimeBy(10_000L)
        device.stream.emit(LiveLocationFix(45.0, 5.0, accuracy = 8.0))
        runCurrent()

        assertThat(device.center.roster.value.entry(bob)).isNotNull()
        assertThat(device.updates).hasSize(sent)
        assertThat(device.receivedMarks["me"]).isTrue()
        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()
        assertThat(relaunched.following).isEqualTo(0)
    }

    @Test
    fun `la meme personne repartagee ailleurs, liste identique, fait ceder aussi`() = runTest {
        val device = Device(this)
        publishing(device)
        device.servedSnapshot = servedFrom(elsewhere, alice to hour)

        device.ownChanged.emit(Unit)
        runCurrent()

        assertThat(device.receivedMarks["me"]).isTrue()
    }

    @Test
    fun `son propre demarrage relu avec une echeance decalee de dix minutes ne fait pas ceder`() = runTest {
        val device = Device(this)
        publishing(device)
        val sent = device.updates.size
        device.servedSnapshot = servedFrom(mine, alice to hour + 600_000L)

        device.ownChanged.emit(Unit)
        runCurrent()
        advanceTimeBy(10_000L)
        device.stream.emit(LiveLocationFix(45.0, 5.0, accuracy = 8.0))
        runCurrent()

        assertThat(device.receivedMarks["me"]).isNotEqualTo(true)
        assertThat(device.updates.size).isGreaterThan(sent)
    }

    @Test
    fun `un accuse perdu prend le demarrage servi pour le sien, puis cede au suivant`() = runTest {
        val device = Device(this)
        runCurrent()
        device.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.UNCONFIRMED)
        device.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        device.servedSnapshot = servedFrom(mine, alice to hour)
        device.ownChanged.emit(Unit)
        runCurrent()
        assertThat(device.receivedMarks["me"]).isNotEqualTo(true)

        device.servedSnapshot = servedFrom(elsewhere, alice to hour)
        device.ownChanged.emit(Unit)
        runCurrent()

        assertThat(device.receivedMarks["me"]).isTrue()
    }

    @Test
    fun `une passerelle qui ne nomme pas le demarrage ne fait jamais ceder`() = runTest {
        val device = Device(this)
        publishing(device)
        device.servedSnapshot = servedFrom(null, alice to hour, bob to hour)

        device.ownChanged.emit(Unit)
        runCurrent()

        assertThat(device.receivedMarks["me"]).isNotEqualTo(true)
    }

    @Test
    fun `le demarrage d'un autre compte du telephone ne fait pas ceder le partage de celui-ci`() = runTest {
        val device = Device(this)
        publishing(device)
        device.account = "other"
        device.center.clear()
        runCurrent()
        device.startVerdict = SharedLocationStartVerdict.Started(hour, elsewhere)
        device.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()

        device.account = "me"
        device.center.clear()
        runCurrent()
        device.servedSnapshot = servedFrom(mine, alice to hour)
        device.ownChanged.emit(Unit)
        runCurrent()

        assertThat(device.receivedMarks["me"]).isNotEqualTo(true)
    }

    @Test
    fun `relance apres qu'un autre appareil a repris le partage, cet appareil cede au lieu de republier`() = runTest {
        val device = Device(this)
        publishing(device)
        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()
        relaunched.servedSnapshot = servedFrom(elsewhere, alice to hour)

        relaunched.ownChanged.emit(Unit)
        runCurrent()
        advanceTimeBy(10_000L)
        relaunched.stream.emit(LiveLocationFix(45.0, 5.0, accuracy = 8.0))
        runCurrent()

        assertThat(relaunched.receivedMarks["me"]).isTrue()
        assertThat(relaunched.updates).isEmpty()
        assertThat(relaunched.startMarks["me"]).isNull()
    }

    @Test
    fun `relance sans reprise ailleurs, cet appareil continue de publier`() = runTest {
        val device = Device(this)
        publishing(device)
        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()
        relaunched.servedSnapshot = servedFrom(mine, alice to hour)

        relaunched.ownChanged.emit(Unit)
        runCurrent()
        advanceTimeBy(10_000L)
        relaunched.stream.emit(LiveLocationFix(45.0, 5.0, accuracy = 8.0))
        runCurrent()

        assertThat(relaunched.receivedMarks["me"]).isNotEqualTo(true)
        assertThat(relaunched.updates).isNotEmpty()
        assertThat(relaunched.startMarks["me"]).isEqualTo(mine)
    }

    @Test
    fun `relance, un releve arrive avant la relecture ne part pas, et l'appareil cede a celui qui a repris`() = runTest {
        val device = Device(this)
        publishing(device)
        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()

        relaunched.stream.emit(LiveLocationFix(45.0, 5.0, accuracy = 8.0))
        runCurrent()
        assertThat(relaunched.updates).isEmpty()

        relaunched.servedSnapshot = servedFrom(elsewhere, alice to hour)
        relaunched.ownChanged.emit(Unit)
        runCurrent()
        advanceTimeBy(10_000L)
        relaunched.stream.emit(LiveLocationFix(45.1, 5.0, accuracy = 8.0))
        runCurrent()

        assertThat(relaunched.updates).isEmpty()
        assertThat(relaunched.receivedMarks["me"]).isTrue()
    }

    @Test
    fun `relance, une passerelle d'avant la relecture leve l'attente et le releve suivant part`() = runTest {
        val device = Device(this)
        publishing(device)
        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()
        relaunched.servedSnapshot = null

        relaunched.ownChanged.emit(Unit)
        runCurrent()
        relaunched.stream.emit(LiveLocationFix(45.0, 5.0, accuracy = 8.0))
        runCurrent()

        assertThat(relaunched.reads).isEqualTo(1)
        assertThat(relaunched.updates).hasSize(1)
    }

    @Test
    fun `relance, une relecture en panne garde l'attente, se rejoue, et l'appareil cede a celui qui a repris`() = runTest {
        val device = Device(this)
        publishing(device)
        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()
        relaunched.servedFailure = IllegalStateException("hors ligne")

        relaunched.ownChanged.emit(Unit)
        runCurrent()
        relaunched.stream.emit(LiveLocationFix(45.0, 5.0, accuracy = 8.0))
        runCurrent()
        assertThat(relaunched.updates).isEmpty()

        relaunched.servedFailure = null
        relaunched.servedSnapshot = servedFrom(elsewhere, alice to hour)
        advanceTimeBy(31_000L)
        runCurrent()
        relaunched.stream.emit(LiveLocationFix(45.1, 5.0, accuracy = 8.0))
        runCurrent()

        assertThat(relaunched.reads).isAtLeast(2)
        assertThat(relaunched.updates).isEmpty()
        assertThat(relaunched.receivedMarks["me"]).isTrue()
    }

    @Test
    fun `relance, une relecture en panne puis qui confirme mon demarrage laisse partir le releve suivant`() = runTest {
        val device = Device(this)
        publishing(device)
        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()
        relaunched.servedFailure = IllegalStateException("503")
        relaunched.ownChanged.emit(Unit)
        runCurrent()

        relaunched.servedFailure = null
        relaunched.servedSnapshot = servedFrom(mine, alice to hour)
        relaunched.ownChanged.emit(Unit)
        runCurrent()
        relaunched.stream.emit(LiveLocationFix(45.0, 5.0, accuracy = 8.0))
        runCurrent()

        assertThat(relaunched.updates).hasSize(1)
    }

    private suspend fun TestScope.publishingToTwoThenWithdrawingBob(device: Device) {
        publishing(device)
        device.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()
        device.saved["me"] = SharedLocationRoster.fromStored(device.saved["me"]).withdrawing(bob, currentTime).stored()
    }

    @Test
    fun `relance, une echeance passee avant la relecture pendant une panne n'envoie rien et se rejoue`() = runTest {
        val device = Device(this)
        device.saved["me"] = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.EIGHT_HOURS, currentTime)
            .adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, currentTime - 2 * hour)
            .stored()
        device.servedFailure = IllegalStateException("hors ligne")

        val problem = device.center.reconcile()
        runCurrent()

        assertThat(problem).isEqualTo(SharedLocationShareProblem.Refused(SharedLocationSendOutcome.UNCONFIRMED))
        assertThat(device.starts).isEmpty()
        assertThat(device.stops).isEqualTo(0)
        assertThat(device.reads).isEqualTo(1)

        advanceTimeBy(31_000L)
        runCurrent()

        assertThat(device.reads).isAtLeast(2)
        assertThat(device.starts).isEmpty()
        assertThat(device.updates).isEmpty()
        device.endOutage()
    }

    @Test
    fun `relance, un arreter en attente part en liste seule malgre une panne prolongee de la relecture`() = runTest {
        val device = Device(this)
        publishingToTwoThenWithdrawingBob(device)
        val relaunched = device.relaunched()
        relaunched.servedFailure = IllegalStateException("hors ligne")

        repeat(3) { relaunched.center.reconcile() }
        runCurrent()

        assertThat(relaunched.center.roster.value.isWithdrawalPending(bob)).isFalse()
        assertThat(relaunched.starts).isNotEmpty()
        assertThat(relaunched.starts.all { it.isListOnly }).isTrue()
        assertThat(relaunched.updates).isEmpty()
        assertThat(relaunched.fixAsks).isEqualTo(0)
        relaunched.endOutage()
    }

    @Test
    fun `relance, reconcilier avant la relecture relit d'abord et applique la liste servie`() = runTest {
        val device = Device(this)
        publishingToTwoThenWithdrawingBob(device)
        val relaunched = device.relaunched()
        relaunched.servedSnapshot = servedFrom(mine, alice to hour)

        relaunched.center.reconcile()
        runCurrent()

        assertThat(relaunched.reads).isEqualTo(1)
        assertThat(relaunched.center.roster.value.isWithdrawalPending(bob)).isFalse()
        assertThat(relaunched.center.roster.value.entry(alice)).isNotNull()
    }

    @Test
    fun `la relecture servie, une passerelle d'avant la route n'est pas une reponse, toute autre issue est une panne`() {
        val json = Json { ignoreUnknownKeys = true }
        val fastify = ApiError(
            "Not Found",
            httpStatus = 404,
            servedMessage = "Route GET:/api/v1/relations/locations/mine not found",
        )
        assertThat(ownSharedLocationAnswer(NetworkResult.Failure(fastify), json)).isNull()
        assertThat(ownSharedLocationAnswer(NetworkResult.Success(SharedLocationOwnSnapshotWire(recipients = emptyList())), json))
            .isEqualTo(SharedLocationOwnSnapshot(emptyList()))
        listOf(
            NetworkResult.Failure(ApiError("panne", httpStatus = 503)),
            NetworkResult.Failure(ApiError("session", httpStatus = 401)),
            NetworkResult.Failure(ApiError("hors ligne")),
            NetworkResult.Failure(ApiError("Not Found", code = "HTTP_404", httpStatus = 404)),
            NetworkResult.Failure(ApiError("Not Found", httpStatus = 404, servedMessage = "404 page not found")),
            NetworkResult.Success(SharedLocationOwnSnapshotWire()),
        ).forEach { result ->
            assertThat(runCatching { ownSharedLocationAnswer(result, json) }.exceptionOrNull())
                .isInstanceOf(SharedLocationReadFailed::class.java)
        }
    }

    @Test
    fun `relance, partager d'ici avant la relecture fait publier aussitot`() = runTest {
        val device = Device(this)
        publishing(device)
        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()
        relaunched.startVerdict = SharedLocationStartVerdict.Started(hour, elsewhere)

        relaunched.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()
        advanceTimeBy(10_000L)
        relaunched.stream.emit(LiveLocationFix(45.0, 5.0, accuracy = 8.0))
        runCurrent()

        assertThat(relaunched.updates).hasSize(1)
    }

    @Test
    fun `relance, une passerelle d'avant la liste seule ne recoit jamais la position d'ici avant la relecture, le partage s'arrete`() = runTest {
        val device = Device(this)
        publishing(device)
        device.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()
        val relaunched = device.relaunched()
        relaunched.center.restore()
        runCurrent()
        relaunched.queuedStartVerdicts += SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.INVALID)

        val problem = relaunched.center.stopSharing(bob)
        runCurrent()

        assertThat(problem).isNull()
        assertThat(relaunched.stops).isEqualTo(1)
        assertThat(relaunched.starts.all { it.isListOnly }).isTrue()
        assertThat(relaunched.fixAsks).isEqualTo(0)
        assertThat(relaunched.center.roster.value.isEmpty).isTrue()
    }

    @Test
    fun `un partage arrete ailleurs oublie le demarrage garde`() = runTest {
        val device = Device(this)
        publishing(device)
        device.servedSnapshot = servedFrom(null)

        device.ownChanged.emit(Unit)
        runCurrent()

        assertThat(device.startMarks["me"]).isNull()
    }
}
