package me.meeshy.sdk.model.composer.timeline.engine

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Assert.assertThrows
import org.junit.Test

class TimelineMediaSourceTest {

    @Test
    fun `une image n'a pas d'URL, une video prend la sienne, un type inconnu est ecarte`() {
        val urls = mapOf("v" to "file:///v.mp4")
        assertThat(TimelineMediaSource.fromMediaObject(StoryMediaObject(id = "i", mediaType = "image"), urls)?.url).isNull()
        assertThat(TimelineMediaSource.fromMediaObject(StoryMediaObject(id = "v", mediaType = "video"), urls)?.url).isEqualTo("file:///v.mp4")
        assertThat(TimelineMediaSource.fromMediaObject(StoryMediaObject(id = "x", mediaType = "gif"), urls)).isNull()
    }

    @Test
    fun `un echec transitoire est repris une fois apres la pause`() = runTest {
        var attempts = 0
        val pauses = mutableListOf<Long>()
        val result = loadAssetWithRetry(TimelineMediaSource.audio("a", "u"), { pauses += it }) {
            if (++attempts == 1) error("réseau")
            "ok"
        }
        assertThat(result).isEqualTo("ok")
        assertThat(pauses).containsExactly(500L)
    }

    @Test
    fun `deux echecs remontent le second`() = runTest {
        assertThrows(IllegalStateException::class.java) {
            kotlinx.coroutines.runBlocking { loadAssetWithRetry<String>(TimelineMediaSource.audio("a", "u"), {}) { error("non") } }
        }
    }

    @Test
    fun `sans URL l'echec est typé`() = runTest {
        val failure = runCatching { loadAssetWithRetry(TimelineMediaSource.audio("a", null), {}) { "x" } }.exceptionOrNull()
        assertThat(failure).isEqualTo(TimelineEngineError.AssetLoadFailed("a", "URL manquante"))
    }
}
