package me.meeshy.ui.component.link

import android.app.Activity
import android.app.Application
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExternalLinkTest {

    private val application: Application = ApplicationProvider.getApplicationContext()

    private fun activityWithoutHandlers(): Activity {
        shadowOf(application).checkActivities(true)
        return Robolectric.buildActivity(Activity::class.java).setup().get()
    }

    private fun clipboardText(): String? =
        (application.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager)
            .primaryClip?.getItemAt(0)?.text?.toString()

    @Test
    fun `a mailto with no mail app copies the address instead of crashing`() {
        val outcome = activityWithoutHandlers().openExternalLink("mailto:support@meeshy.me?subject=Bug")

        assertThat(outcome).isEqualTo(ExternalLinkOutcome.AddressCopied)
        assertThat(clipboardText()).isEqualTo("support@meeshy.me")
    }

    @Test
    fun `a web link with no browser degrades to unavailable instead of crashing`() {
        val outcome = activityWithoutHandlers().openExternalLink("https://meeshy.me/help")

        assertThat(outcome).isEqualTo(ExternalLinkOutcome.Unavailable)
    }

    @Test
    fun `a link with a handler opens through the activity`() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()

        val outcome = activity.openExternalLink("https://meeshy.me/help")

        assertThat(outcome).isEqualTo(ExternalLinkOutcome.Opened)
        assertThat(shadowOf(activity).nextStartedActivity.data).isEqualTo(Uri.parse("https://meeshy.me/help"))
    }

    @Test
    fun `the address of a mailto drops its query and decodes it`() {
        assertThat(mailtoAddress("mailto:support%40meeshy.me?subject=Idea")).isEqualTo("support@meeshy.me")
        assertThat(mailtoAddress("https://meeshy.me")).isNull()
        assertThat(mailtoAddress("mailto:")).isNull()
    }
}
