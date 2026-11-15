package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EmbeddableVideoResolverTest {
    private val id = "dQw4w9WgXcQ"

    @Test
    fun `les hotes youtube et nocookie et youtu be sont reconnus`() {
        listOf(
            "https://youtu.be/$id",
            "https://www.youtube.com/watch?v=$id",
            "https://m.youtube.com/watch?v=$id",
            "https://www.youtube-nocookie.com/embed/$id",
            "https://youtube.com/shorts/$id",
            "https://youtube.com/live/$id",
            "https://youtube.com/v/$id",
        ).forEach { assertThat(EmbeddableVideoResolver.resolve(it)?.videoId).isEqualTo(id) }
    }

    @Test
    fun `un hote ressemblant ou un schema autre est refuse`() {
        assertThat(EmbeddableVideoResolver.resolve("https://notyoutube.com/watch?v=$id")).isNull()
        assertThat(EmbeddableVideoResolver.resolve("https://youtube.com.evil.io/watch?v=$id")).isNull()
        assertThat(EmbeddableVideoResolver.resolve("ftp://youtu.be/$id")).isNull()
    }

    @Test
    fun `un identifiant hors de six a vingt caracteres ou mal forme est refuse`() {
        assertThat(EmbeddableVideoResolver.resolve("https://youtu.be/court")).isNull()
        assertThat(EmbeddableVideoResolver.resolve("https://youtu.be/${"a".repeat(21)}")).isNull()
        assertThat(EmbeddableVideoResolver.resolve("https://youtu.be/abc!def")).isNull()
        assertThat(EmbeddableVideoResolver.resolve("https://youtu.be/abcdef")?.videoId).isEqualTo("abcdef")
    }

    @Test
    fun `le depart se lit en secondes en duree composee et en fragment`() {
        assertThat(EmbeddableVideoResolver.resolve("https://youtu.be/$id?t=90")?.startSeconds).isEqualTo(90)
        assertThat(EmbeddableVideoResolver.resolve("https://youtu.be/$id?t=1h2m3s")?.startSeconds).isEqualTo(3723)
        assertThat(EmbeddableVideoResolver.resolve("https://www.youtube.com/watch?v=$id&start=15")?.startSeconds).isEqualTo(15)
        assertThat(EmbeddableVideoResolver.resolve("https://youtu.be/$id#t=42s")?.startSeconds).isEqualTo(42)
        assertThat(EmbeddableVideoResolver.resolve("https://youtu.be/$id")?.startSeconds).isNull()
    }

    @Test
    fun `la premiere video du texte gagne`() {
        val link = EmbeddableVideoResolver.resolveIn("voir https://example.com puis https://youtu.be/aaaaaaaaaaa et https://youtu.be/bbbbbbbbbbb.")
        assertThat(link?.videoId).isEqualTo("aaaaaaaaaaa")
        assertThat(EmbeddableVideoResolver.resolveIn("rien ici")).isNull()
    }
}
