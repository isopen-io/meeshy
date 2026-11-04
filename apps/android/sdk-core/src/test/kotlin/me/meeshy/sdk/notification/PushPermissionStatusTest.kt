package me.meeshy.sdk.notification

import android.Manifest
import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PushPermissionStatusTest {
    private val app: Application = ApplicationProvider.getApplicationContext()

    @Test
    fun `before API 33 only the system switch matters`() {
        assertThat(PushPermissionStatus(app, sdkInt = 32).isAuthorized.value).isTrue()
    }

    @Test
    fun `API 33 without the permission is not authorized`() {
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        assertThat(PushPermissionStatus(app, sdkInt = 33).isAuthorized.value).isFalse()
    }

    @Test
    fun `API 33 with the permission and notifications on is authorized`() {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        assertThat(PushPermissionStatus(app, sdkInt = 33).isAuthorized.value).isTrue()
    }

    @Test
    fun `notifications switched off at system level are not authorized`() {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val nm = app.getSystemService(android.app.NotificationManager::class.java)
        shadowOf(nm).setNotificationsEnabled(false)
        assertThat(PushPermissionStatus(app, sdkInt = 33).isAuthorized.value).isFalse()
    }

    @Test
    fun `refresh reflects a permission granted along the way`() {
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val status = PushPermissionStatus(app, sdkInt = 33)
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        assertThat(status.refresh()).isTrue()
        assertThat(status.isAuthorized.value).isTrue()
    }
}
