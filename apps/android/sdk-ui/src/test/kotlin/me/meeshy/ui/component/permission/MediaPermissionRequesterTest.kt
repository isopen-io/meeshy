package me.meeshy.ui.component.permission

import android.app.Application
import android.net.Uri
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AndroidPermissions
import me.meeshy.sdk.model.PermissionExplainReason
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.PermissionRequestPlan
import me.meeshy.sdk.model.PermissionStep
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.sdk.permission.PermissionRequestHistory
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * L'adaptateur Android de la porte unique : il relève les faits (accordé, explication encore
 * possible, historique, notifications, politique) et la décision en découle. Refus simple et
 * refus définitif ne se distinguent que par `shouldShowRequestPermissionRationale` APRÈS une
 * demande déjà faite : c'est ce que ces cas posent.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaPermissionRequesterTest {

    private val application: Application = ApplicationProvider.getApplicationContext()
    private val microphone = AndroidPermissions.RECORD_AUDIO

    private class InMemoryHistory(initial: Set<String> = emptySet()) : PermissionRequestHistory {
        val requested: MutableSet<String> = initial.toMutableSet()

        override suspend fun wasRequested(permission: String): Boolean = permission in requested

        override suspend fun requestedAmong(permissions: Collection<String>): Set<String> =
            permissions.filter { it in requested }.toSet()

        override suspend fun markRequested(permissions: Collection<String>) {
            requested += permissions
        }
    }

    private fun requester(
        history: PermissionRequestHistory = InMemoryHistory(),
        sdkInt: Int = 34,
        granted: Set<String> = emptySet(),
        rationale: Set<String> = emptySet(),
        notificationsEnabled: Boolean = true,
        blocked: Boolean = false,
    ) = MediaPermissionRequester(
        context = application,
        history = history,
        sdkInt = sdkInt,
        isGranted = { it in granted },
        rationaleSuggested = { it in rationale },
        notificationsEnabled = { notificationsEnabled },
        blockedByPolicy = { blocked },
    )

    @Test
    fun `a never asked microphone is promptable and explained first`() = runTest {
        val snapshot = requester().snapshot(PermissionNature.MICROPHONE)

        assertThat(snapshot.state).isEqualTo(MediaPermissionState.NOT_DETERMINED)
        assertThat(PermissionRequestPlan.decide(snapshot))
            .isEqualTo(PermissionStep.ExplainThenRequest(PermissionExplainReason.FIRST_REQUEST))
    }

    @Test
    fun `a granted microphone is granted`() = runTest {
        val state = requester(granted = setOf(microphone)).state(PermissionNature.MICROPHONE)

        assertThat(state).isEqualTo(MediaPermissionState.GRANTED)
    }

    @Test
    fun `a simple refusal is asked again after an explanation`() = runTest {
        val requester = requester(history = InMemoryHistory(setOf(microphone)), rationale = setOf(microphone))

        val snapshot = requester.snapshot(PermissionNature.MICROPHONE)

        assertThat(snapshot.state).isEqualTo(MediaPermissionState.NOT_DETERMINED)
        assertThat(PermissionRequestPlan.decide(snapshot))
            .isEqualTo(PermissionStep.ExplainThenRequest(PermissionExplainReason.AFTER_REFUSAL))
    }

    @Test
    fun `a definitive refusal is sent to the settings`() = runTest {
        val requester = requester(history = InMemoryHistory(setOf(microphone)), rationale = emptySet())

        val snapshot = requester.snapshot(PermissionNature.MICROPHONE)

        assertThat(snapshot.state).isEqualTo(MediaPermissionState.DENIED)
        assertThat(PermissionRequestPlan.decide(snapshot)).isEqualTo(PermissionStep.SendToSettings)
    }

    @Test
    fun `marking a request is remembered for that nature only`() = runTest {
        val history = InMemoryHistory()
        val requester = requester(history = history)

        requester.markRequested(PermissionNature.MICROPHONE)

        assertThat(requester.state(PermissionNature.MICROPHONE)).isEqualTo(MediaPermissionState.DENIED)
        assertThat(requester.state(PermissionNature.CAMERA)).isEqualTo(MediaPermissionState.NOT_DETERMINED)
        assertThat(history.requested).containsExactly(microphone)
    }

    @Test
    fun `photo reading on Android 14 asks for the three media permissions at once`() {
        val permissions = requester(sdkInt = 34).systemPermissions(PermissionNature.PHOTO_LIBRARY_READ)

        assertThat(permissions.toList()).containsExactly(
            AndroidPermissions.READ_MEDIA_IMAGES,
            AndroidPermissions.READ_MEDIA_VIDEO,
            AndroidPermissions.READ_MEDIA_VISUAL_USER_SELECTED,
        )
    }

    @Test
    fun `a selected photos grant is limited and usable`() = runTest {
        val requester = requester(granted = setOf(AndroidPermissions.READ_MEDIA_VISUAL_USER_SELECTED))

        val state = requester.state(PermissionNature.PHOTO_LIBRARY_READ)

        assertThat(state).isEqualTo(MediaPermissionState.LIMITED)
        assertThat(state.isUsable).isTrue()
    }

    @Test
    fun `muted notifications before Android 13 can only be fixed from the settings`() = runTest {
        val requester = requester(sdkInt = 32, notificationsEnabled = false)

        val snapshot = requester.snapshot(PermissionNature.NOTIFICATIONS)

        assertThat(requester.systemPermissions(PermissionNature.NOTIFICATIONS)).isEmpty()
        assertThat(PermissionRequestPlan.decide(snapshot)).isEqualTo(PermissionStep.SendToSettings)
    }

    @Test
    fun `a camera blocked by policy is restricted even when granted`() = runTest {
        val requester = requester(granted = setOf(AndroidPermissions.CAMERA), blocked = true)

        assertThat(requester.state(PermissionNature.CAMERA)).isEqualTo(MediaPermissionState.RESTRICTED)
    }

    @Test
    fun `opening the settings targets the details of this app`() {
        val opened = requester().openSettings()

        val intent = shadowOf(application).nextStartedActivity
        assertThat(opened).isTrue()
        assertThat(intent.action).isEqualTo(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        assertThat(intent.data).isEqualTo(Uri.fromParts("package", application.packageName, null))
    }
}
