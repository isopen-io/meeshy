package me.meeshy.app

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The interface-language context must keep the Activity in its chain: `hiltViewModel()` walks
 * `baseContext` up to an Activity and throws on a bare `ContextImpl` — which crashed the app on
 * every launch once a display language was chosen (#12206).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LocalizedContextTest {

    private val activity: Activity = Robolectric.buildActivity(Activity::class.java).setup().get()

    private tailrec fun Context.findActivity(): Activity? = when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

    @Test
    fun `the localized context still leads to the activity, as hiltViewModel requires`() {
        val localized = localizedContext(activity, "fr", activity.resources.configuration)

        assertThat(localized.findActivity()).isSameInstanceAs(activity)
    }

    @Test
    fun `the localized context serves the chosen language's resources`() {
        val localized = localizedContext(activity, "fr", activity.resources.configuration)

        assertThat(localized.resources.configuration.locales[0].language).isEqualTo("fr")
    }
}
