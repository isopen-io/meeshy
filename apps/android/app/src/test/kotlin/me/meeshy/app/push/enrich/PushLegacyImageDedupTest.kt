package me.meeshy.app.push.enrich

import android.app.Notification
import android.content.Context
import android.graphics.Bitmap
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.app.push.IncomingPush
import me.meeshy.app.push.media.PushMediaFetcher
import me.meeshy.app.push.pipeline.EnrichmentPhase
import me.meeshy.app.push.pipeline.EnrichmentRequest
import me.meeshy.app.push.pipeline.NotificationEnricher
import me.meeshy.sdk.model.UserNotificationPreferences
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** L'ancien enrichisseur d'image est retiré : une image ne se télécharge qu'une fois, par UN enrichisseur MEDIA. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class PushLegacyImageDedupTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun `la charge a l ancienne n envoie l image qu une fois`() = runTest {
        val context: Context = ApplicationProvider.getApplicationContext()
        val file = tmp.newFile().also { f -> f.outputStream().use { Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.PNG, 100, it) } }
        val fetcher = mockk<PushMediaFetcher> { coEvery { fetch(any(), any(), any(), any(), any()) } answers { file } }
        val enrichers: Set<NotificationEnricher> = setOf(RichMediaEnricher(context, fetcher))
        val request = EnrichmentRequest(
            push = IncomingPush.of(
                mapOf(
                    "type" to "new_message",
                    "firstAttachmentUrl" to "https://gate.meeshy.me/files/p.jpg",
                    "attachmentMimeType" to "image/jpeg",
                    "thumbnailUrl" to "https://gate.meeshy.me/files/t.jpg",
                ),
            ),
            preferences = UserNotificationPreferences(),
            channelId = "c", groupKey = null, badge = null, passive = false,
            deadlineMillis = System.currentTimeMillis() + 20_000,
        )
        val builder = NotificationCompat.Builder(context, "c").setSmallIcon(android.R.drawable.sym_def_app_icon)

        enrichers.filter { it.phase == EnrichmentPhase.MEDIA }.forEach { it.enrich(builder, request) }

        assertThat(enrichers.count { it.phase == EnrichmentPhase.MEDIA }).isEqualTo(1)
        assertThat(builder.build().extras.getString(Notification.EXTRA_TEMPLATE)).isEqualTo("android.app.Notification\$BigPictureStyle")
        coVerify(exactly = 1) { fetcher.fetch(any(), any(), any(), any(), any()) }
    }
}
