package me.meeshy.app.contacts.circles

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.relation.RelationRefusal
import me.meeshy.sdk.model.relation.RelationRitualCompletedEvent
import me.meeshy.sdk.model.relation.RelationRitualConsentKey
import me.meeshy.sdk.model.relation.RelationRitualPhase
import me.meeshy.sdk.model.relation.RelationRitualProgressEvent
import me.meeshy.sdk.model.relation.RelationRitualStartedEvent
import me.meeshy.sdk.model.relation.RelationRitualStep
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

/** Le rituel du Sang côté écran (#13938) — iso `BloodRitualViewModelTests.swift`. */
@OptIn(ExperimentalCoroutinesApi::class)
class BloodRitualControllerTest {

    private val started = MutableSharedFlow<RelationRitualStartedEvent>(extraBufferCapacity = 8)
    private val progress = MutableSharedFlow<RelationRitualProgressEvent>(extraBufferCapacity = 8)
    private val completed = MutableSharedFlow<RelationRitualCompletedEvent>(extraBufferCapacity = 8)

    private fun TestScope.controller(gateway: FakeCirclesGateway, online: Boolean = true) = BloodRitualController(
        userId = "u2",
        displayName = "Ana",
        gateway = gateway,
        isOnline = { online },
        events = RitualEvents(started, progress, completed),
        scope = TestScope(UnconfinedTestDispatcher(testScheduler)),
        wait = { awaitCancellation() },
    )

    private fun opened(token: String = "t") = NetworkResult.Success(RelationRitualStep(token = token, holdWindowMs = 15_000L))

    @Test
    fun `les consentements partent tous refuses et se choisissent avant d'ouvrir`() = runTest {
        val ritual = controller(FakeCirclesGateway())

        assertThat(ritual.state.value.stage).isEqualTo(RitualStage.CONSENT)
        assertThat(RelationRitualConsentKey.entries.none { ritual.state.value.consents.isGranted(it) }).isTrue()
        ritual.setConsent(RelationRitualConsentKey.LOCATION_LIVE, true)
        ritual.proceedFromConsents()
        ritual.setConsent(RelationRitualConsentKey.LISTENING_TITLE, true)

        assertThat(ritual.state.value.stage).isEqualTo(RitualStage.READY)
        assertThat(ritual.state.value.consents.locationLive).isTrue()
        assertThat(ritual.state.value.consents.listeningTitle).isFalse()
    }

    @Test
    fun `hors ligne le rituel est indisponible et le dit`() = runTest {
        val gateway = FakeCirclesGateway()
        val ritual = controller(gateway, online = false)
        ritual.proceedFromConsents()

        ritual.open()

        assertThat(ritual.state.value.stage).isEqualTo(RitualStage.UNAVAILABLE)
        assertThat(ritual.state.value.isOfflineUnavailable).isTrue()
        assertThat(gateway.ritualCalls).isEmpty()
    }

    @Test
    fun `quand les deux tiennent, le scellement part avec les consentements choisis`() = runTest {
        val gateway = FakeCirclesGateway()
        gateway.ritualReplies += opened()
        gateway.ritualReplies += NetworkResult.Success(RelationRitualStep(held = true))
        gateway.ritualReplies += NetworkResult.Success(RelationRitualStep(completed = true, level = "BLOOD"))
        val ritual = controller(gateway)
        ritual.setConsent(RelationRitualConsentKey.LOCATION_PROXIMITY, true)
        ritual.proceedFromConsents()
        ritual.open()
        assertThat(ritual.state.value.stage).isEqualTo(RitualStage.WAITING)

        progress.emit(RelationRitualProgressEvent(token = "t", userId = "u2", stage = "held"))
        ritual.holdBegan()

        assertThat(ritual.state.value.stage).isEqualTo(RitualStage.COMPLETED)
        val confirm = gateway.ritualCalls.last()
        assertThat(confirm.first).isEqualTo(RelationRitualPhase.CONFIRM)
        assertThat(confirm.second).isEqualTo("t")
        assertThat(confirm.third?.locationProximity).isTrue()
        assertThat(confirm.third?.locationLive).isFalse()
    }

    @Test
    fun `si l'autre lache, rien n'est enregistre et l'on peut recommencer`() = runTest {
        val gateway = FakeCirclesGateway()
        gateway.ritualReplies += opened()
        val ritual = controller(gateway)
        ritual.proceedFromConsents()
        ritual.open()
        ritual.holdBegan()

        progress.emit(RelationRitualProgressEvent(token = "t", userId = "u2", stage = "lapsed"))

        assertThat(ritual.state.value.stage).isEqualTo(RitualStage.LAPSED)
        assertThat(ritual.state.value.isHolding).isFalse()
        ritual.retry()
        assertThat(ritual.state.value.stage).isEqualTo(RitualStage.READY)
    }

    @Test
    fun `un evenement d'une autre personne ou d'un autre jeton est ignore`() = runTest {
        val gateway = FakeCirclesGateway()
        gateway.ritualReplies += opened()
        val ritual = controller(gateway)
        ritual.proceedFromConsents()
        ritual.open()

        progress.emit(RelationRitualProgressEvent(token = "t", userId = "someone-else", stage = "lapsed"))
        progress.emit(RelationRitualProgressEvent(token = "other", userId = "u2", stage = "lapsed"))

        assertThat(ritual.state.value.stage).isEqualTo(RitualStage.WAITING)
    }

    @Test
    fun `un consentement exige ramene aux consentements, un refus definitif rend le rituel indisponible`() = runTest {
        val gateway = FakeCirclesGateway()
        gateway.ritualReplies += opened()
        gateway.ritualReplies += NetworkResult.Success(RelationRitualStep(held = true))
        gateway.ritualReplies += refused("RELATION_CONSENT_REQUIRED")
        val ritual = controller(gateway)
        ritual.proceedFromConsents()
        ritual.open()
        progress.emit(RelationRitualProgressEvent(token = "t", userId = "u2", stage = "held"))
        ritual.holdBegan()

        assertThat(ritual.state.value.stage).isEqualTo(RitualStage.CONSENT)

        val other = FakeCirclesGateway()
        other.ritualReplies += refused("RELATION_RITUAL_NO_REQUEST")
        val closed = controller(other)
        closed.proceedFromConsents()
        closed.open()

        assertThat(closed.state.value.stage).isEqualTo(RitualStage.UNAVAILABLE)
        assertThat(closed.state.value.refusal).isEqualTo(RelationRefusal.RITUAL_NO_REQUEST)
    }

    @Test
    fun `l'autre qui scelle acheve le rituel, et l'autre qui ouvre se voit`() = runTest {
        val gateway = FakeCirclesGateway()
        val ritual = controller(gateway)
        started.emit(RelationRitualStartedEvent(token = "t", userId = "u2"))
        assertThat(ritual.state.value.otherIsWaiting).isTrue()

        completed.emit(RelationRitualCompletedEvent(token = "t", userId = "u2", level = "BLOOD"))

        assertThat(ritual.state.value.stage).isEqualTo(RitualStage.COMPLETED)
    }
}
