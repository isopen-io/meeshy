package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import org.junit.Test
import java.io.IOException
import java.io.InputStream

class UploadedMediaSeederTest {

    private fun seeder(cache: RecordingUploadedMediaCache) = cache.seeder()

    private fun sent(bytes: ByteArray = byteArrayOf(1, 2, 3, 4), mime: String = "audio/mp4") =
        MediaUploadItem(bytes, "voice.m4a", mime)

    private fun uploaded(url: String = "2026/10/a1/voice.m4a", mime: String = "audio/mp4", size: Long = 4L) =
        UploadedMedia(id = "a1", url = url, mimeType = mime, fileSize = size, width = null, height = null, durationMs = null, thumbnailUrl = null)

    @Test
    fun `un vocal envoye entre au cache audio sous l adresse que la bulle lira`() = runTest {
        val cache = RecordingUploadedMediaCache()

        seeder(cache).seed(sent(), uploaded())

        val adoption = cache.adoptions.single()
        assertThat(adoption.category).isEqualTo(MediaCacheCategory.AUDIO)
        assertThat(adoption.url).isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/2026/10/a1/voice.m4a")
        assertThat(adoption.bytes).isEqualTo(byteArrayOf(1, 2, 3, 4))
    }

    @Test
    fun `une video envoyee entre au cache video`() = runTest {
        val cache = RecordingUploadedMediaCache()

        seeder(cache).seed(sent(mime = "video/mp4"), uploaded(url = "https://cdn.meeshy.me/clip.mp4", mime = "video/mp4"))

        assertThat(cache.adoptions.single().category).isEqualTo(MediaCacheCategory.VIDEO)
        assertThat(cache.adoptions.single().url).isEqualTo("https://cdn.meeshy.me/clip.mp4")
    }

    @Test
    fun `une image envoyee entre au cache d images sous l adresse que la bulle lira`() = runTest {
        val cache = RecordingUploadedMediaCache()

        seeder(cache).seed(sent(mime = "image/jpeg"), uploaded(url = "2026/10/a1/photo.jpg", mime = "image/jpeg"))

        val adoption = cache.adoptions.single()
        assertThat(adoption.category).isEqualTo(MediaCacheCategory.IMAGES)
        assertThat(adoption.url).isEqualTo("https://gate.meeshy.me/api/v1/attachments/file/2026/10/a1/photo.jpg")
        assertThat(adoption.bytes).isEqualTo(byteArrayOf(1, 2, 3, 4))
    }

    @Test
    fun `une image que le serveur a reecrite n est pas adoptee a la place de la sienne`() = runTest {
        val cache = RecordingUploadedMediaCache()

        seeder(cache).seed(sent(mime = "image/jpeg"), uploaded(mime = "image/jpeg", size = 5L))

        assertThat(cache.adoptions).isEmpty()
    }

    @Test
    fun `un document n entre a aucun cache`() = runTest {
        val cache = RecordingUploadedMediaCache()

        seeder(cache).seed(sent(mime = "application/pdf"), uploaded(mime = "application/pdf"))

        assertThat(cache.adoptions).isEmpty()
    }

    @Test
    fun `un fichier que le serveur a reecrit n est pas adopte a la place du sien`() = runTest {
        val cache = RecordingUploadedMediaCache()

        seeder(cache).seed(sent(), uploaded(size = 3L))

        assertThat(cache.adoptions).isEmpty()
    }

    @Test
    fun `une adoption qui echoue ne fait jamais echouer l envoi`() = runTest {
        val failing = object : UploadedMediaCache {
            override fun adopt(category: MediaCacheCategory, url: String, length: Long, open: () -> InputStream): Boolean =
                throw IOException("disque plein")
        }

        UploadedMediaSeeder(failing, { null }, Dispatchers.Unconfined).seed(sent(), uploaded())
    }
}
