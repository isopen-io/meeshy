package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class MediaAdoptionTest {
    @get:Rule val folder = TemporaryFolder()

    private val remote = "https://gate.meeshy.me/api/v1/static/u/2025/photo.jpg"
    private val cache by lazy { TypedMediaCache(MediaCacheDirs(folder.newFolder("cache"), folder.root)) }
    private val ownedDir by lazy { folder.newFolder("owned") }
    private val adoption by lazy {
        MediaAdoption(cache, { "https://gate.meeshy.me/api/v1/" }, OwnedMediaRoots(listOf(ownedDir))::owns, Dispatchers.Unconfined)
    }

    private fun local(name: String = "p.jpg", bytes: Int = 12, dir: File = ownedDir) =
        File(dir, name).apply { writeBytes(ByteArray(bytes) { 1 }) }

    private fun attachment(url: String?, mime: String = "image/jpeg", id: String = "a1") =
        ApiMessageAttachment(id = id, fileUrl = url, mimeType = mime)

    private fun adopt(optimistic: List<ApiMessageAttachment>, acked: List<ApiMessageAttachment>) =
        runBlocking { adoption.adopt(optimistic, acked) }

    @Test
    fun `a l'ACK le fichier local rejoint le cache sous la cle canonique et celui de la file disparait`() {
        val file = local()
        val adopted = adopt(listOf(attachment(file.toURI().toString())), listOf(attachment(remote)))
        assertThat(adopted).isEqualTo(1)
        assertThat(cache.contains(MediaCacheCategory.IMAGES, remote)).isTrue()
        assertThat(cache.file(MediaCacheCategory.IMAGES, remote)?.length()).isEqualTo(12L)
        assertThat(file.exists()).isFalse()
    }

    @Test
    fun `un fichier hors des racines de l'app est copie, jamais supprime`() {
        val gallery = local(dir = folder.newFolder("gallery"))
        adopt(listOf(attachment(gallery.toURI().toString())), listOf(attachment(remote)))
        assertThat(cache.contains(MediaCacheCategory.IMAGES, remote)).isTrue()
        assertThat(gallery.exists()).isTrue()
    }

    @Test
    fun `audio et video vont dans leur cache type`() {
        val audio = local("a.m4a")
        val video = local("v.mp4")
        adopt(
            listOf(attachment(audio.toURI().toString(), "audio/mp4", "1"), attachment(video.toURI().toString(), "video/mp4", "2")),
            listOf(attachment("https://gate.meeshy.me/x/a.m4a", "audio/mp4", "1"), attachment("https://gate.meeshy.me/x/v.mp4", "video/mp4", "2")),
        )
        assertThat(cache.contains(MediaCacheCategory.AUDIO, "https://gate.meeshy.me/x/a.m4a")).isTrue()
        assertThat(cache.contains(MediaCacheCategory.VIDEO, "https://gate.meeshy.me/x/v.mp4")).isTrue()
    }

    @Test
    fun `no-op quand la pieces etait deja https, message recu ou rafraichissement`() {
        assertThat(adopt(listOf(attachment(remote)), listOf(attachment(remote)))).isEqualTo(0)
        assertThat(adopt(emptyList(), listOf(attachment(remote)))).isEqualTo(0)
        assertThat(cache.contains(MediaCacheCategory.IMAGES, remote)).isFalse()
    }

    @Test
    fun `no-op quand l'envoi a echoue et que l'adresse reste locale`() {
        val file = local()
        val uri = file.toURI().toString()
        assertThat(adopt(listOf(attachment(uri)), listOf(attachment(uri)))).isEqualTo(0)
        assertThat(file.exists()).isTrue()
    }

    @Test
    fun `no-op quand le fichier local a disparu`() {
        val ghost = File(ownedDir, "gone.jpg").toURI().toString()
        assertThat(adopt(listOf(attachment(ghost)), listOf(attachment(remote)))).isEqualTo(0)
        assertThat(cache.contains(MediaCacheCategory.IMAGES, remote)).isFalse()
    }

    @Test
    fun `no-op pour un document et une localisation`() {
        val doc = local("d.pdf")
        val pdf = "https://gate.meeshy.me/x/d.pdf"
        assertThat(adopt(listOf(attachment(doc.toURI().toString(), "application/pdf")), listOf(attachment(pdf, "application/pdf")))).isEqualTo(0)
        assertThat(doc.exists()).isTrue()
        val place = ApiMessageAttachment(id = "p", fileUrl = null, latitude = 1.0, longitude = 2.0)
        assertThat(adopt(listOf(place), listOf(place))).isEqualTo(0)
    }

    @Test
    fun `une cle deja en cache n'est pas reecrite`() {
        runBlocking {
            cache.store(MediaCacheCategory.IMAGES, remote, File(cache.stagingDir(MediaCacheCategory.IMAGES), "x").apply { writeBytes(ByteArray(3)) })
        }
        val file = local()
        assertThat(adopt(listOf(attachment(file.toURI().toString())), listOf(attachment(remote)))).isEqualTo(0)
        assertThat(cache.file(MediaCacheCategory.IMAGES, remote)?.length()).isEqualTo(3L)
    }

    @Test
    fun `les pieces s'apparient par identifiant avant la position`() {
        val first = local("one.jpg", 5)
        val second = local("two.jpg", 9)
        val urlOne = "https://gate.meeshy.me/x/one.jpg"
        val urlTwo = "https://gate.meeshy.me/x/two.jpg"
        adopt(
            listOf(attachment(first.toURI().toString(), id = "A"), attachment(second.toURI().toString(), id = "B")),
            listOf(attachment(urlTwo, id = "B"), attachment(urlOne, id = "A")),
        )
        assertThat(cache.file(MediaCacheCategory.IMAGES, urlOne)?.length()).isEqualTo(5L)
        assertThat(cache.file(MediaCacheCategory.IMAGES, urlTwo)?.length()).isEqualTo(9L)
    }
}
