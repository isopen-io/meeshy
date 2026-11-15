package me.meeshy.sdk.media

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RangeFrameExtractorTest {
    @get:Rule val tmp = TemporaryFolder()

    private class Recorder : FirstFrameDecoder {
        var decodedSize = -1L
        override fun decode(file: File, maxDimension: Int): Bitmap {
            decodedSize = file.length()
            return Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888)
        }
    }

    private fun extractor(decoder: FirstFrameDecoder, online: Boolean = true) =
        RangeFrameExtractor(OkHttpClient(), tmp.newFolder(), { online }, decoder)

    @Test fun `demande le premier Mo par Range et ne garde que ce Mo`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(200).setBody(Buffer().write(ByteArray(2_000_000))))
            val decoder = Recorder()
            val frame = extractor(decoder).extract(server.url("/v.mp4").toString(), 1_920)
            assertThat(frame).isNotNull()
            assertThat(server.takeRequest().getHeader("Range")).isEqualTo("bytes=0-1048575")
            assertThat(decoder.decodedSize).isEqualTo(1_048_576L)
        }
    }

    @Test fun `hors ligne rien ne part et rien n'est extrait`() = runBlocking {
        MockWebServer().use { server ->
            val frame = extractor(Recorder(), online = false).extract(server.url("/v.mp4").toString(), 1_920)
            assertThat(frame).isNull()
            assertThat(server.requestCount).isEqualTo(0)
        }
    }

    @Test fun `une reponse en erreur ne donne rien`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(403))
            assertThat(extractor(Recorder()).extract(server.url("/v.mp4").toString(), 300)).isNull()
        }
    }
}
