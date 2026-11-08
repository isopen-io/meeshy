package me.meeshy.sdk.media

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.media.VideoPosterPlan.Intent
import okhttp3.OkHttpClient
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class VideoPosterResolverTest {
    @get:Rule val tmp = TemporaryFolder()

    private val url = "https://m.meeshy.me/v.mp4"

    private class MemStore : VideoPosterStore {
        val map = HashMap<String, Bitmap>()
        override fun read(videoUrl: String, maxPixel: Int) = map[videoUrl]
        override fun write(videoUrl: String, frame: Bitmap) { map[videoUrl] = frame }
    }

    private fun resolver(
        store: VideoPosterStore = MemStore(),
        local: File? = null,
        awaited: File? = null,
        policy: Boolean = false,
        online: Boolean = true,
        size: Int = 1_920,
    ): VideoPosterResolver {
        val decoder = FirstFrameDecoder { _, _ -> Bitmap.createBitmap(size, 2, Bitmap.Config.ARGB_8888) }
        val files = object : VideoFileSource {
            override fun localFile(videoUrl: String) = local
            override suspend fun awaitFile(videoUrl: String) = awaited
        }
        return VideoPosterResolver(
            files, store, RangeFrameExtractor(OkHttpClient(), tmp.newFolder(), { false }, decoder),
            decoder, { policy }, { online },
        )
    }

    @Test fun `un fichier local est decode et le poster persiste`() = runBlocking {
        val store = MemStore()
        val frame = resolver(store, local = tmp.newFile("v.mp4")).resolve(url, null, false, Intent.AMBIENT_PREWARM)
        assertThat(frame).isNotNull()
        assertThat(store.map).containsKey(url)
    }

    @Test fun `un poster net deja persiste court-circuite la cascade`() = runBlocking {
        val store = MemStore().also { it.write(url, Bitmap.createBitmap(1_000, 2, Bitmap.Config.ARGB_8888)) }
        val frame = resolver(store).resolve(url, null, true, Intent.USER_OPENED)
        assertThat(frame!!.width).isEqualTo(1_000)
    }

    @Test fun `un poster de grade bulle est refuse et re-extrait`() = runBlocking {
        val store = MemStore().also { it.write(url, Bitmap.createBitmap(300, 2, Bitmap.Config.ARGB_8888)) }
        val frame = resolver(store, local = tmp.newFile("v.mp4")).resolve(url, 4_000, true, Intent.USER_OPENED)
        assertThat(frame!!.width).isEqualTo(1_920)
    }

    @Test fun `politique permissive attend le fichier telecharge`() = runBlocking {
        val frame = resolver(awaited = tmp.newFile("d.mp4"), policy = true)
            .resolve(url, null, true, Intent.AMBIENT_PREWARM)
        assertThat(frame).isNotNull()
    }

    @Test fun `hors ligne sans fichier rien`() = runBlocking {
        assertThat(resolver(policy = true, online = false).resolve(url, null, true, Intent.USER_OPENED)).isNull()
    }

    @Test fun `l'echantillonnage borne le decodage des surfaces de liste`() {
        assertThat(DiskVideoPosterStore.sampleSize(1_920, 600)).isEqualTo(2)
        assertThat(DiskVideoPosterStore.sampleSize(500, 600)).isEqualTo(1)
    }
}
