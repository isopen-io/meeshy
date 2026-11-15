package me.meeshy.app.chat

import android.content.ClipData
import android.content.ContentResolver
import android.net.Uri
import android.view.View
import androidx.core.view.ContentInfoCompat
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowContentResolver

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PasteContentReceiverTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

    private class Harness(val receiver: PasteContentReceiver, val picked: MutableList<Triple<File, String, String?>>, val rejected: IntArray)

    private fun TestScope.harness(maxBytes: Long = 1024): Harness {
        val picked = mutableListOf<Triple<File, String, String?>>()
        val rejected = intArrayOf(0)
        val dir = File(context.cacheDir, "paste-test-${System.nanoTime()}")
        return Harness(
            PasteContentReceiver(
                contentResolver = context.contentResolver,
                workDir = dir,
                scope = this,
                ioDispatcher = StandardTestDispatcher(testScheduler),
                onPickFile = { f, n, m -> picked += Triple(f, n, m) },
                onRejected = { rejected[0]++ },
                maxBytes = maxBytes,
            ),
            picked,
            rejected,
        )
    }

    private fun uriWith(bytes: Int, mime: String): Uri {
        val uri = Uri.parse("content://me.meeshy.test/${System.nanoTime()}")
        val shadow = org.robolectric.Shadows.shadowOf(context.contentResolver)
        shadow.registerInputStream(uri, ByteArray(bytes) { 1 }.inputStream())
        return uri
    }

    private fun payload(clip: ClipData) = ContentInfoCompat.Builder(clip, ContentInfoCompat.SOURCE_CLIPBOARD).build()

    @Test
    fun `une image reçue devient une pièce et le champ n'est pas touché`() = runTest {
        val h = harness()
        val uri = uriWith(10, "image/gif")
        val clip = ClipData("gif", arrayOf("image/gif"), ClipData.Item(uri))
        val rest = h.receiver.onReceiveContent(View(context), payload(clip))
        testScheduler.advanceUntilIdle()
        assertThat(rest).isNull()
        assertThat(h.picked).hasSize(1)
        assertThat(h.picked[0].first.length()).isEqualTo(10L)
    }

    @Test
    fun `le texte brut est rendu au champ`() = runTest {
        val h = harness()
        val clip = ClipData.newPlainText("t", "bonjour")
        val p = payload(clip)
        assertThat(h.receiver.onReceiveContent(View(context), p)).isSameInstanceAs(p)
        testScheduler.advanceUntilIdle()
        assertThat(h.picked).isEmpty()
    }

    @Test
    fun `un média trop gros est refusé avec message sans pièce`() = runTest {
        val h = harness(maxBytes = 5)
        val uri = uriWith(100, "video/mp4")
        val clip = ClipData("v", arrayOf("video/mp4"), ClipData.Item(uri))
        h.receiver.onReceiveContent(View(context), payload(clip))
        testScheduler.advanceUntilIdle()
        assertThat(h.picked).isEmpty()
        assertThat(h.rejected[0]).isEqualTo(1)
    }
}
