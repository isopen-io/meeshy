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
import me.meeshy.app.push.pipeline.EnrichmentRequest
import me.meeshy.sdk.model.UserNotificationPreferences
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class RichMediaEnricherTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val photo = "https://gate.meeshy.me/files/p.jpg"
    private val avatar = "https://gate.meeshy.me/files/a.jpg"

    private fun png(): File = tmp.newFile().also {
        it.outputStream().use { out -> Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.PNG, 100, out) }
    }

    private fun fetcher(vararg served: String): PushMediaFetcher = mockk {
        coEvery { fetch(any(), any(), any(), any(), any()) } returns null
        served.forEach { url -> coEvery { fetch(url, any(), any(), any(), any()) } answers { png() } }
    }

    private fun request(vararg data: Pair<String, String>) = EnrichmentRequest(
        push = IncomingPush.of(mapOf("type" to "new_message", "title" to "Alice", "senderAvatar" to avatar, *data)),
        preferences = UserNotificationPreferences(),
        channelId = "c",
        groupKey = null,
        badge = null,
        passive = false,
        deadlineMillis = System.currentTimeMillis() + 20_000,
    )

    private suspend fun render(fetcher: PushMediaFetcher, req: EnrichmentRequest): Notification {
        val builder = NotificationCompat.Builder(context, "c").setSmallIcon(android.R.drawable.sym_def_app_icon)
        RichMediaEnricher(context, fetcher).enrich(builder, req)
        return builder.build()
    }

    private fun Notification.template() = extras.getString(Notification.EXTRA_TEMPLATE)

    @Test
    fun `une image du message devient une grande image avec la photo ronde de l expediteur`() = runTest {
        val note = render(fetcher(photo, avatar), request("attachmentUrl" to photo, "attachmentMimeType" to "image/jpeg", "body" to "Regarde"))

        assertThat(note.template()).isEqualTo("android.app.Notification\$BigPictureStyle")
        assertThat(note.getLargeIcon()).isNotNull()
    }

    @Test
    fun `une video montre la vignette du serveur et jamais le fichier video`() = runTest {
        val fetcher = fetcher(photo)
        val note = render(fetcher, request("attachmentUrl" to "https://gate.meeshy.me/files/v.mp4", "attachmentMimeType" to "video/mp4", "thumbnailUrl" to photo))

        assertThat(note.template()).isEqualTo("android.app.Notification\$BigPictureStyle")
        coVerify(exactly = 0) { fetcher.fetch("https://gate.meeshy.me/files/v.mp4", any(), any(), any(), any()) }
    }

    @Test
    fun `un vocal sans texte servi se dit Message vocal et sa duree`() = runTest {
        val note = render(fetcher(), request("attachmentUrl" to "https://gate.meeshy.me/files/v.m4a", "attachmentMimeType" to "audio/mp4", "attachmentDurationMs" to "12000"))

        assertThat(note.extras.getCharSequence(Notification.EXTRA_TEXT).toString()).isEqualTo("Voice message · 0:12")
    }

    @Test
    fun `un vocal dont le texte est servi garde le texte du serveur`() = runTest {
        val note = render(fetcher(), request("attachmentUrl" to "https://gate.meeshy.me/files/v.m4a", "attachmentMimeType" to "audio/mp4", "body" to "Bonjour"))

        assertThat(note.extras.getCharSequence(Notification.EXTRA_TEXT)).isNull()
    }

    @Test
    fun `un message protege ne porte aucune image ni photo ni libelle`() = runTest {
        val fetcher = fetcher(photo, avatar)
        val note = render(fetcher, request("attachmentUrl" to photo, "attachmentMimeType" to "image/jpeg", "thumbnailUrl" to photo, "notificationLocKey" to "view_once"))

        assertThat(note.template()).isNull()
        assertThat(note.getLargeIcon()).isNull()
        coVerify(exactly = 0) { fetcher.fetch(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `un vocal ephemere ne dit pas sa duree`() = runTest {
        val note = render(fetcher(), request("attachmentUrl" to "https://gate.meeshy.me/files/v.m4a", "attachmentMimeType" to "audio/mp4", "attachmentDurationMs" to "12000", "ephemeralDuration" to "30"))

        assertThat(note.extras.getCharSequence(Notification.EXTRA_TEXT)).isNull()
    }

    @Test
    fun `une image illisible laisse la banniere texte seule`() = runTest {
        val note = render(fetcher(), request("attachmentUrl" to photo, "attachmentMimeType" to "image/jpeg"))

        assertThat(note.template()).isNull()
    }
}
