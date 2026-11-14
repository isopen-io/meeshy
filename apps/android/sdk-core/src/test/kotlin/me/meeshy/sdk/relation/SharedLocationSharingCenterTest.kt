package me.meeshy.sdk.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
                    return startVerdict
                }
                override suspend fun update(fix: SharedLocationFix): SharedLocationStartVerdict {
                    updates += fix
                    return updateVerdict
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
}
