package me.meeshy.sdk.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.location.LiveLocationFixSource
import me.meeshy.sdk.location.LocationPermissionGate
import me.meeshy.sdk.model.LiveLocationFix
import me.meeshy.sdk.model.relation.SharedLocationFix
import me.meeshy.sdk.model.relation.SharedLocationPrecision
import me.meeshy.sdk.model.relation.SharedLocationRoster
import me.meeshy.sdk.model.relation.SharedLocationSendOutcome
import me.meeshy.sdk.model.relation.SharedLocationShareDuration
import me.meeshy.sdk.model.relation.SharedLocationStartRequest
import me.meeshy.sdk.model.relation.SharedLocationStartVerdict
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SharedLocationSharingCenterTest {

    private val alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private val hour = 3_600_000L

    private class Rig(
        scope: TestScope,
        var granted: Boolean = true,
        var deviceFix: LiveLocationFix? = LiveLocationFix(48.8566, 2.3522, accuracy = 8.0),
        var account: String? = "me",
        var startVerdict: SharedLocationStartVerdict = SharedLocationStartVerdict.Started(0L),
        var updateVerdict: SharedLocationStartVerdict = SharedLocationStartVerdict.Started(0L),
        var stopConfirmed: Boolean = true,
    ) {
        /** Posé : la prochaine émission attend qu'on la complète, pour rejouer une réponse en vol. */
        var startGate: CompletableDeferred<SharedLocationStartVerdict>? = null
        var updateGate: CompletableDeferred<SharedLocationStartVerdict>? = null
        val connected = MutableStateFlow(false)
        val starts = mutableListOf<SharedLocationStartRequest>()
        val updates = mutableListOf<SharedLocationFix>()
        var stops = 0
        val stream = MutableSharedFlow<LiveLocationFix>(extraBufferCapacity = 8)
        val saved = mutableMapOf<String, String?>()
        var following = 0

        val center = SharedLocationSharingCenter(
            emitter = object : SharedLocationEmitting {
                override suspend fun start(request: SharedLocationStartRequest): SharedLocationStartVerdict {
                    starts += request
                    return startGate?.await() ?: startVerdict
                }
                override suspend fun update(fix: SharedLocationFix): SharedLocationStartVerdict {
                    updates += fix
                    return updateGate?.await() ?: updateVerdict
                }
                override suspend fun stop(): Boolean {
                    stops++
                    return stopConfirmed
                }
            },
            fixes = object : LiveLocationFixSource {
                override suspend fun currentFix() = deviceFix
                override fun updates(intervalMillis: Long): Flow<LiveLocationFix> {
                    following++
                    return stream
                }
            },
            permission = LocationPermissionGate { granted },
            store = object : SharedLocationRosterStoring {
                override fun load(accountId: String): String? = saved[accountId]
                override fun save(accountId: String, stored: String?) { saved[accountId] = stored }
            },
            accountId = { account },
            connected = connected,
            clock = { scope.currentTime },
            dispatcher = StandardTestDispatcher(scope.testScheduler),
        )
    }

    @Test
    fun `partager envoie la position complete une fois avec la liste entiere et la garde sans aucune position`() = runTest {
        val rig = Rig(this)

        val problem = rig.center.share(alice, SharedLocationPrecision.NEIGHBORHOOD, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()

        assertThat(problem).isNull()
        val sent = rig.starts.single()
        assertThat(sent.recipients.map { it.userId to it.precision }).containsExactly(alice to SharedLocationPrecision.NEIGHBORHOOD)
        assertThat(sent.duration).isEqualTo(SharedLocationShareDuration.ONE_HOUR)
        assertThat(sent.fix.wire()).containsEntry("accuracy", 8.0)
        assertThat(rig.center.roster.value.entry(alice)).isNotNull()
        assertThat(rig.saved["me"]).doesNotContain("48.85")
        assertThat(rig.following).isEqualTo(1)
    }

    @Test
    fun `sans permission ou sans releve rien ne part et l'ecran sait pourquoi`() = runTest {
        val denied = Rig(this, granted = false)
        assertThat(denied.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR))
            .isEqualTo(SharedLocationShareProblem.LocationDenied)
        val lost = Rig(this, deviceFix = null)
        assertThat(lost.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR))
            .isEqualTo(SharedLocationShareProblem.LocationUnavailable)
        assertThat(denied.starts + lost.starts).isEmpty()
    }

    @Test
    fun `un refus de la passerelle ne pose rien dans la liste`() = runTest {
        val rig = Rig(this, startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.RATE_LIMITED))

        val problem = rig.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)

        assertThat(problem).isEqualTo(SharedLocationShareProblem.Refused(SharedLocationSendOutcome.RATE_LIMITED))
        assertThat(rig.center.roster.value.isEmpty).isTrue()
        assertThat(rig.saved["me"]).isNull()
    }

    @Test
    fun `arreter pour une personne republie la liste reduite et arreter la derniere emet stop`() = runTest {
        val rig = Rig(this)
        rig.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        rig.center.share(bob, SharedLocationPrecision.EXACT, SharedLocationShareDuration.EIGHT_HOURS)

        rig.center.stopSharing(bob)
        assertThat(rig.starts.last().recipients.map { it.userId }).containsExactly(alice)
        assertThat(rig.starts.last().duration).isEqualTo(SharedLocationShareDuration.ONE_HOUR)

        rig.center.stopSharing(alice)
        runCurrent()
        assertThat(rig.stops).isEqualTo(1)
        assertThat(rig.center.roster.value.isEmpty).isTrue()
        assertThat(rig.saved["me"]).isNull()
    }

    @Test
    fun `un arret qui n'est pas confirme garde la liste pour que Arreter reste a un geste`() = runTest {
        val rig = Rig(this)
        rig.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        rig.stopConfirmed = false

        val problem = rig.center.stopSharing(alice)

        assertThat(problem).isEqualTo(SharedLocationShareProblem.Refused(SharedLocationSendOutcome.OFFLINE))
        assertThat(rig.center.roster.value.entry(alice)).isNotNull()
    }

    @Test
    fun `a l'echeance d'une personne elle sort du partage serveur et les autres le gardent`() = runTest {
        val rig = Rig(this)
        rig.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        rig.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS)

        advanceTimeBy(hour + 2_000L)
        runCurrent()

        assertThat(rig.starts.last().recipients.map { it.userId }).containsExactly(bob)
        assertThat(rig.center.roster.value.entry(alice)).isNull()
        assertThat(rig.stops).isEqualTo(0)
    }

    @Test
    fun `les mises a jour suivent la cadence et un partage perdu cote serveur arrete l'emetteur`() = runTest {
        val rig = Rig(this)
        rig.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()

        rig.stream.emit(LiveLocationFix(48.8566 + 0.0001, 2.3522))
        runCurrent()
        assertThat(rig.updates).isEmpty()

        advanceTimeBy(6_000L)
        rig.updateVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.NOT_SHARING)
        rig.stream.emit(LiveLocationFix(48.8566 + 0.01, 2.3522))
        runCurrent()

        assertThat(rig.updates).hasSize(1)
        assertThat(rig.center.roster.value.isEmpty).isTrue()
        assertThat(rig.saved["me"]).isNull()
    }

    @Test
    fun `la liste gardee reprend au lancement pour son compte seulement et une echeance passee se solde`() = runTest {
        val rig = Rig(this, account = "me")
        rig.saved["me"] = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = -2 * hour)
            .adding(bob, SharedLocationPrecision.EXACT, SharedLocationShareDuration.EIGHT_HOURS, nowMillis = 0L)
            .stored()
        rig.saved["other"] = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.EIGHT_HOURS, nowMillis = 0L)
            .stored()

        rig.center.restore()
        runCurrent()

        assertThat(rig.center.roster.value.entry(bob)).isNotNull()
        assertThat(rig.center.roster.value.entry(alice)).isNull()
        assertThat(rig.starts.last().recipients.map { it.userId }).containsExactly(bob)

        rig.account = "other"
        rig.center.restore()
        runCurrent()
        assertThat(rig.center.roster.value.entry(bob)).isNull()
        assertThat(rig.center.roster.value.entry(alice)).isNotNull()
    }

    @Test
    fun `la fin de session cesse de suivre sans rien emettre et garde la liste du compte parti`() = runTest {
        val rig = Rig(this)
        rig.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()

        rig.center.clear()
        advanceTimeBy(10_000L)
        rig.stream.emit(LiveLocationFix(49.5, 3.0))
        advanceTimeBy(hour + 2_000L)

        assertThat(rig.updates).isEmpty()
        assertThat(rig.stops).isEqualTo(0)
        assertThat(rig.starts).hasSize(1)
        assertThat(rig.center.roster.value.isEmpty).isTrue()
        assertThat(rig.saved["me"]).isNotNull()
    }

    @Test
    fun `aucune mise a jour ne part pendant qu'un demarrage attend son accuse et le partage pose reste entier`() = runTest {
        val rig = Rig(this)
        rig.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        runCurrent()
        advanceTimeBy(6_000L)
        val inFlight = CompletableDeferred<SharedLocationStartVerdict>()
        rig.startGate = inFlight
        val adding = launch { rig.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR) }
        runCurrent()

        rig.stream.emit(LiveLocationFix(48.8566 + 0.01, 2.3522))
        runCurrent()
        inFlight.complete(SharedLocationStartVerdict.Started(0L))
        adding.join()

        assertThat(rig.updates).isEmpty()
        assertThat(rig.starts.last().recipients.map { it.userId }).containsExactly(alice, bob).inOrder()
        assertThat(rig.center.roster.value.entry(bob)).isNotNull()
        assertThat(rig.saved["me"]).isNotNull()
    }

    @Test
    fun `sans permission arreter une personne arrete tout plutot que de la laisser voir`() = runTest {
        val rig = Rig(this)
        rig.saved["me"] = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS, nowMillis = 0L)
            .adding(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS, nowMillis = 0L)
            .stored()
        rig.granted = false

        val problem = rig.center.stopSharing(alice)

        assertThat(problem).isNull()
        assertThat(rig.stops).isEqualTo(1)
        assertThat(rig.starts).isEmpty()
        assertThat(rig.center.roster.value.isEmpty).isTrue()
    }

    @Test
    fun `une echeance qui n'a pas pu se solder est rejouee jusqu'a ce que le serveur l'accepte`() = runTest {
        val rig = Rig(this)
        rig.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)
        rig.center.share(bob, SharedLocationPrecision.CITY, SharedLocationShareDuration.EIGHT_HOURS)
        rig.startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.OFFLINE)

        advanceTimeBy(hour + 2_000L)
        runCurrent()
        assertThat(rig.center.roster.value.entry(alice)).isNotNull()

        rig.startVerdict = SharedLocationStartVerdict.Started(0L)
        advanceTimeBy(31_000L)
        runCurrent()

        assertThat(rig.center.roster.value.entry(alice)).isNull()
        assertThat(rig.starts.last().recipients.map { it.userId }).containsExactly(bob)
    }

    @Test
    fun `un accuse perdu garde Arreter a portee pour chaque personne que le serveur peut servir`() = runTest {
        val rig = Rig(this, startVerdict = SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.UNCONFIRMED))

        val problem = rig.center.share(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR)

        assertThat(problem).isEqualTo(SharedLocationShareProblem.Refused(SharedLocationSendOutcome.UNCONFIRMED))
        assertThat(rig.center.roster.value.entry(alice)).isNotNull()
        rig.center.stopSharing(alice)
        assertThat(rig.stops).isEqualTo(1)
    }

    @Test
    fun `une reponse arrivee apres la deconnexion n'adopte rien n'ecrit rien et ne rallume rien`() = runTest {
        val rig = Rig(this)
        val inFlight = CompletableDeferred<SharedLocationStartVerdict>()
        rig.startGate = inFlight
        val sharing = launch { rig.center.share(alice, SharedLocationPrecision.EXACT, SharedLocationShareDuration.EIGHT_HOURS) }
        runCurrent()

        rig.center.clear()
        rig.account = "other"
        inFlight.complete(SharedLocationStartVerdict.Started(0L))
        sharing.join()
        advanceTimeBy(8 * hour + 2_000L)
        runCurrent()

        assertThat(rig.starts).hasSize(1)
        assertThat(rig.following).isEqualTo(0)
        assertThat(rig.saved).doesNotContainKey("other")
        assertThat(rig.saved["me"]).isNull()
        assertThat(rig.center.roster.value.isEmpty).isTrue()
    }

    @Test
    fun `une socket accrochee reprend la liste gardee et solde l'echeance passee sans ouvrir de fiche`() = runTest {
        val rig = Rig(this)
        rig.saved["me"] = SharedLocationRoster.EMPTY
            .adding(alice, SharedLocationPrecision.CITY, SharedLocationShareDuration.ONE_HOUR, nowMillis = -2 * hour)
            .stored()

        rig.connected.value = true
        runCurrent()

        assertThat(rig.stops).isEqualTo(1)
        assertThat(rig.saved["me"]).isNull()
    }
}
