package me.meeshy.ui.component.permission

import android.app.Application
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AndroidPermissions
import me.meeshy.sdk.model.PermissionExplainReason
import me.meeshy.sdk.model.PermissionFlowState
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.permission.PermissionRequestHistory
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * La porte unique de bout en bout, sans Compose : l'explication précède toujours la boîte
 * système, un refus simple n'affiche rien et sera ré-expliqué, un refus définitif affiche la
 * carte, et le retour des Réglages avec l'accès accordé relance l'intention initiale.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PermissionFlowTest {

    private val application: Application = ApplicationProvider.getApplicationContext()
    private val microphone = AndroidPermissions.RECORD_AUDIO

    /**
     * [PermissionFlow.state] est un état Compose écrit ici HORS composition : l'écriture poste la
     * notification d'instantané global sur le Looper principal. Robolectric vide cette file entre
     * deux tests ; un message jeté laisse le répartiteur Compose de la sandbox « déjà planifié »
     * à jamais, et tout test Compose suivant n'atteint plus l'inactivité. On draine donc le Looper.
     */
    @After
    fun drainMainLooper() {
        shadowOf(Looper.getMainLooper()).idle()
    }

    private class InMemoryHistory : PermissionRequestHistory {
        val requested = mutableSetOf<String>()

        override suspend fun wasRequested(permission: String): Boolean = permission in requested

        override suspend fun requestedAmong(permissions: Collection<String>): Set<String> =
            permissions.filter { it in requested }.toSet()

        override suspend fun markRequested(permissions: Collection<String>) {
            requested += permissions
        }
    }

    /** L'appareil simulé : ce que le système répond change d'un test à l'autre. */
    private class Device {
        val granted = mutableSetOf<String>()
        val rationale = mutableSetOf<String>()
        val systemPrompts = mutableListOf<List<String>>()
    }

    private fun flow(scope: TestScope, device: Device, history: PermissionRequestHistory = InMemoryHistory()): PermissionFlow {
        val requester = MediaPermissionRequester(
            context = application,
            history = history,
            sdkInt = 34,
            isGranted = { it in device.granted },
            rationaleSuggested = { it in device.rationale },
            notificationsEnabled = { true },
            blockedByPolicy = { false },
        )
        return PermissionFlow(requester, scope).also { built ->
            built.launchSystemPermissions = { permissions -> device.systemPrompts.add(permissions.toList()) }
        }
    }

    @Test
    fun `an already granted access resumes at once and shows nothing`() = runTest {
        val device = Device().apply { granted += microphone }
        val flow = flow(this, device)

        val result = async { flow.ensure(PermissionNature.MICROPHONE) }
        runCurrent()

        assertThat(result.await()).isTrue()
        assertThat(flow.state).isEqualTo(PermissionFlowState.Idle)
        assertThat(device.systemPrompts).isEmpty()
    }

    @Test
    fun `the first request explains first and only then shows the system prompt`() = runTest {
        val device = Device()
        val history = InMemoryHistory()
        val flow = flow(this, device, history)

        val result = async { flow.ensure(PermissionNature.MICROPHONE) }
        runCurrent()

        assertThat(flow.state).isEqualTo(
            PermissionFlowState.Explaining(PermissionNature.MICROPHONE, PermissionExplainReason.FIRST_REQUEST, true),
        )
        assertThat(device.systemPrompts).isEmpty()

        flow.onExplanationAccepted()
        runCurrent()
        device.granted += microphone
        flow.onSystemAnswered()
        runCurrent()

        assertThat(device.systemPrompts).containsExactly(listOf(microphone))
        assertThat(history.requested).containsExactly(microphone)
        assertThat(result.await()).isTrue()
        assertThat(flow.state).isEqualTo(PermissionFlowState.Idle)
    }

    @Test
    fun `dismissing the explanation returns false without any system prompt`() = runTest {
        val device = Device()
        val flow = flow(this, device)

        val result = async { flow.ensure(PermissionNature.MICROPHONE) }
        runCurrent()
        flow.onDismissed()
        runCurrent()

        assertThat(result.await()).isFalse()
        assertThat(device.systemPrompts).isEmpty()
        assertThat(flow.state).isEqualTo(PermissionFlowState.Idle)
    }

    @Test
    fun `a simple refusal shows no card and the next request explains again`() = runTest {
        val device = Device()
        val flow = flow(this, device)

        val first = async { flow.ensure(PermissionNature.MICROPHONE) }
        runCurrent()
        flow.onExplanationAccepted()
        runCurrent()
        device.rationale += microphone
        flow.onSystemAnswered()
        runCurrent()

        assertThat(first.await()).isFalse()
        assertThat(flow.state).isEqualTo(PermissionFlowState.Idle)

        val second = async { flow.ensure(PermissionNature.MICROPHONE) }
        runCurrent()

        assertThat(flow.state).isEqualTo(
            PermissionFlowState.Explaining(PermissionNature.MICROPHONE, PermissionExplainReason.AFTER_REFUSAL, true),
        )
        flow.onDismissed()
        runCurrent()
        assertThat(second.await()).isFalse()
    }

    @Test
    fun `a definitive refusal shows the card and coming back granted from the settings resumes the intent`() = runTest {
        val device = Device()
        val flow = flow(this, device)

        val result = async { flow.ensure(PermissionNature.MICROPHONE) }
        runCurrent()
        flow.onExplanationAccepted()
        runCurrent()
        flow.onSystemAnswered()
        runCurrent()

        assertThat(flow.state).isEqualTo(PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE))
        assertThat(result.isCompleted).isFalse()

        flow.onOpenSettingsTapped()
        assertThat(shadowOf(application).nextStartedActivity).isNotNull()

        device.granted += microphone
        flow.onResumed()
        runCurrent()

        assertThat(result.await()).isTrue()
        assertThat(flow.state).isEqualTo(PermissionFlowState.Idle)
        assertThat(device.systemPrompts).hasSize(1)
    }

    @Test
    fun `coming back from the settings still denied keeps the card`() = runTest {
        val device = Device()
        val history = InMemoryHistory().apply { requested += microphone }
        val flow = flow(this, device, history)

        val result = async { flow.ensure(PermissionNature.MICROPHONE) }
        runCurrent()
        assertThat(flow.state).isEqualTo(PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE))

        flow.onResumed()
        runCurrent()

        assertThat(flow.state).isEqualTo(PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE))
        flow.onDismissed()
        runCurrent()
        assertThat(result.await()).isFalse()
        assertThat(device.systemPrompts).isEmpty()
    }

    @Test
    fun `a caller handling its own fallback gets no card on a definitive refusal`() = runTest {
        val device = Device()
        val history = InMemoryHistory().apply { requested += AndroidPermissions.CAMERA }
        val flow = flow(this, device, history)

        val result = async { flow.ensure(PermissionNature.CAMERA, announcesRefusal = false) }
        runCurrent()

        assertThat(result.await()).isFalse()
        assertThat(flow.state).isEqualTo(PermissionFlowState.Idle)
    }

    @Test
    fun `a second request while one is in flight is refused`() = runTest {
        val device = Device()
        val flow = flow(this, device)
        val first = async { flow.ensure(PermissionNature.MICROPHONE) }
        runCurrent()

        val second = async { flow.ensure(PermissionNature.CAMERA) }
        runCurrent()

        assertThat(second.await()).isFalse()
        assertThat(flow.state).isInstanceOf(PermissionFlowState.Explaining::class.java)
        flow.onDismissed()
        runCurrent()
        assertThat(first.await()).isFalse()
    }
}
