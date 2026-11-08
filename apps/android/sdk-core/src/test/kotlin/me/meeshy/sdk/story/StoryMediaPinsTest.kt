package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.media.MediaPinStores
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.Instant

class StoryMediaPinsTest {
    @get:Rule val folder = TemporaryFolder()

    private val now = Instant.parse("2026-11-04T10:00:00Z").toEpochMilli()

    private fun stores() = MediaPinStores(MediaCacheDirs(folder.root, folder.root), clock = { now })
    private fun pins(stores: MediaPinStores = stores()) = StoryMediaPins(stores, clock = { now })

    private fun story(expiresAt: String?, createdAt: String? = null) = StoryItem(
        id = "s1",
        createdAt = createdAt,
        expiresAt = expiresAt,
        media = listOf(
            FeedMedia(id = "m1", type = FeedMediaType.IMAGE, url = "https://cdn/a.mp4"),
            FeedMedia(id = "m2", type = FeedMediaType.IMAGE, url = "https://cdn/b.jpg"),
            FeedMedia(id = "m3", type = FeedMediaType.AUDIO, url = "https://cdn/c.m4a"),
        ),
    )

    @Test
    fun `les medias d'une story vue sont epingles dans le magasin de leur type effectif`() = runTest {
        val stores = stores()
        pins(stores).pin(story(expiresAt = "2026-11-05T00:00:00Z"))
        assertThat(stores.of(MediaCacheCategory.VIDEO).isPinned("https://cdn/a.mp4")).isTrue()
        assertThat(stores.of(MediaCacheCategory.IMAGES).isPinned("https://cdn/a.mp4")).isFalse()
        assertThat(stores.of(MediaCacheCategory.IMAGES).isPinned("https://cdn/b.jpg")).isTrue()
        assertThat(stores.of(MediaCacheCategory.AUDIO).isPinned("https://cdn/c.m4a")).isTrue()
    }

    @Test
    fun `une story deja expiree n'epingle rien`() = runTest {
        val stores = stores()
        pins(stores).pin(story(expiresAt = "2026-11-04T09:00:00Z"))
        assertThat(stores.of(MediaCacheCategory.IMAGES).snapshot().expiries).isEmpty()
    }

    @Test
    fun `sans expiresAt l'echeance est creation plus vingt heures`() {
        val deadline = StoryMediaPins.deadline(story(expiresAt = null, createdAt = "2026-11-04T00:00:00Z"))
        assertThat(deadline).isEqualTo(Instant.parse("2026-11-04T20:00:00Z").toEpochMilli())
    }

    @Test
    fun `une epingle echue s'auto-purge`() = runTest {
        pins().pin(story(expiresAt = "2026-11-04T11:00:00Z"))
        val later = MediaPinStores(MediaCacheDirs(folder.root, folder.root), clock = { now + 2 * 3_600_000L })
        assertThat(later.of(MediaCacheCategory.IMAGES).snapshot().expiries).isEmpty()
    }

    @Test
    fun `le relachement retire les epingles sans supprimer les octets`() = runTest {
        val stores = stores()
        val bytes = File(MediaCacheDirs(folder.root, folder.root).dirFor(MediaCacheCategory.IMAGES), "kept").apply {
            parentFile?.mkdirs()
            writeText("octets")
        }
        val s = story(expiresAt = "2026-11-05T00:00:00Z")
        pins(stores).pin(s)
        pins(stores).release(s)
        assertThat(stores.of(MediaCacheCategory.IMAGES).isPinned("https://cdn/b.jpg")).isFalse()
        assertThat(stores.of(MediaCacheCategory.VIDEO).snapshot().expiries).isEmpty()
        assertThat(bytes.readText()).isEqualTo("octets")
    }
}
