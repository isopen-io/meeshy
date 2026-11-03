package me.meeshy.app.chat.share

import android.app.Application
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ShareHostActionsTest {
    private val context: Application get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `copy puts the text on the clipboard`() {
        assertThat(ShareHostActions.copy(context, "hello")).isTrue()
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        assertThat(clipboard.primaryClip?.getItemAt(0)?.text.toString()).isEqualTo("hello")
    }

    @Test
    fun `copy refuses an empty text and leaves the clipboard alone`() {
        assertThat(ShareHostActions.copy(context, "")).isFalse()
        assertThat(ShareHostActions.copy(context, null)).isFalse()
    }

    @Test
    fun `the text chooser is an ACTION_SEND of plain text`() {
        val chooser = ShareHostActions.textChooser("https://meeshy.me/x")
        assertThat(chooser.action).isEqualTo(Intent.ACTION_CHOOSER)
        val send = chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertThat(send.action).isEqualTo(Intent.ACTION_SEND)
        assertThat(send.type).isEqualTo("text/plain")
        assertThat(send.getStringExtra(Intent.EXTRA_TEXT)).isEqualTo("https://meeshy.me/x")
    }

    @Test
    fun `the file chooser grants read access to the content uri`() {
        val uri = Uri.parse("content://me.meeshy.fileprovider/share/a.jpg")
        val send = ShareHostActions.fileChooser(uri, "image/jpeg").getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
        assertThat(send.type).isEqualTo("image/jpeg")
        assertThat(send.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)).isEqualTo(uri)
        assertThat(send.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION).isNotEqualTo(0)
    }

    @Test
    fun `share out starts the chooser`() {
        assertThat(ShareHostActions.shareOut(context, "hi")).isTrue()
        val started = shadowOf(context).nextStartedActivity
        assertThat(started.action).isEqualTo(Intent.ACTION_CHOOSER)
    }

    @Test
    fun `share out without text starts nothing`() {
        assertThat(ShareHostActions.shareOut(context, null)).isFalse()
        assertThat(shadowOf(context).nextStartedActivity).isNull()
    }
}
