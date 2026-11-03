package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class YouTubeLinkDetectorTest {
    private val id = "dQw4w9WgXcQ"

    @Test
    fun `youtu be est detecte`() {
        assertThat(YouTubeLinkDetector.detect("regarde https://youtu.be/$id vite")?.videoId).isEqualTo(id)
    }

    @Test
    fun `watch avec parametre v est detecte et garde le depart`() {
        val link = YouTubeLinkDetector.detect("https://www.youtube.com/watch?feature=x&v=$id&t=42s")
        assertThat(link?.videoId).isEqualTo(id)
        assertThat(link?.startSeconds).isEqualTo(42)
    }

    @Test
    fun `shorts et embed et m youtube sont detectes`() {
        assertThat(YouTubeLinkDetector.detect("https://www.youtube.com/shorts/$id")?.videoId).isEqualTo(id)
        assertThat(YouTubeLinkDetector.detect("https://youtube.com/embed/$id")?.videoId).isEqualTo(id)
        assertThat(YouTubeLinkDetector.detect("https://m.youtube.com/watch?v=$id")?.videoId).isEqualTo(id)
    }

    @Test
    fun `un hote qui ressemble n est pas youtube`() {
        assertThat(YouTubeLinkDetector.detect("https://notyoutube.com/watch?v=$id")).isNull()
        assertThat(YouTubeLinkDetector.detect("https://youtube.com.evil.io/watch?v=$id")).isNull()
    }

    @Test
    fun `un identifiant mal forme est refuse`() {
        assertThat(YouTubeLinkDetector.detect("https://youtu.be/court")).isNull()
        assertThat(YouTubeLinkDetector.detect("pas de lien")).isNull()
    }

    @Test
    fun `la premiere video du texte gagne et la miniature est derivee`() {
        val link = YouTubeLinkDetector.detect("https://youtu.be/aaaaaaaaaaa puis https://youtu.be/bbbbbbbbbbb")!!
        assertThat(link.videoId).isEqualTo("aaaaaaaaaaa")
        assertThat(link.thumbnailUrl).isEqualTo("https://img.youtube.com/vi/aaaaaaaaaaa/hqdefault.jpg")
        assertThat(link.watchUrl).isEqualTo("https://www.youtube.com/watch?v=aaaaaaaaaaa")
    }
}
