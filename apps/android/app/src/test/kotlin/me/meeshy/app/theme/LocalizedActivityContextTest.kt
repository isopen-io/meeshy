package me.meeshy.app.theme

import android.app.Activity
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import android.util.AndroidRuntimeException
import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [34])
class LocalizedActivityContextTest {

    private fun activity(): Activity = Robolectric.buildActivity(Activity::class.java).setup().get()

    private fun linkIntent() = Intent(Intent.ACTION_VIEW, Uri.parse("mailto:support@meeshy.me"))

    @Test
    fun `a bare configuration context refuses to start an activity, which is the crash being fixed`() {
        val activity = activity()
        val configuration = android.content.res.Configuration(activity.resources.configuration)
            .apply { setLocale(Locale.forLanguageTag("es")) }
        val bare = activity.createConfigurationContext(configuration)

        assertThrows(AndroidRuntimeException::class.java) { bare.startActivity(linkIntent()) }
    }

    @Test
    fun `the forced language reaches the resources the tree reads its strings from`() {
        val localized = LocalizedActivityContext.wrap(activity(), Locale.forLanguageTag("es"))

        assertThat(localized.resources.configuration.locales[0].language).isEqualTo("es")
    }

    @Test
    fun `starting an activity from the localized context goes through the activity and does not throw`() {
        val activity = activity()
        val localized = LocalizedActivityContext.wrap(activity, Locale.forLanguageTag("es"))

        localized.startActivity(linkIntent())

        assertThat(shadowOf(activity).nextStartedActivity.data).isEqualTo(Uri.parse("mailto:support@meeshy.me"))
    }

    @Test
    fun `the activity stays reachable by walking the wrapper chain`() {
        val activity = activity()
        val localized = LocalizedActivityContext.wrap(activity, Locale.forLanguageTag("ar"))

        assertThat((localized as ContextWrapper).baseContext).isSameInstanceAs(activity)
    }
}
