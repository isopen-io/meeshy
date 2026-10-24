package me.meeshy.app.push

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [26])
class FirebaseAvailabilityTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun `configured flips from false to true once FirebaseApp exists and never throws`() {
        FirebaseApp.getApps(context).forEach { it.delete() }
        assertThat(FirebaseAvailability.isConfigured(context)).isFalse()
        assertThat(FirebaseAvailability.isConfigured(context)).isFalse()

        FirebaseApp.initializeApp(
            context,
            FirebaseOptions.Builder()
                .setApplicationId("1:123:android:abc")
                .setApiKey("fake-key")
                .setProjectId("fake-project")
                .build(),
        )

        assertThat(FirebaseAvailability.isConfigured(context)).isTrue()
        assertThat(FirebaseAvailability.isConfigured(context)).isTrue()
    }
}
