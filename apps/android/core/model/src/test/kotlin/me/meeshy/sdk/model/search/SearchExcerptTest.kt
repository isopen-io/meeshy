package me.meeshy.sdk.model.search

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SearchExcerptTest {

    @Test
    fun `a veiled excerpt keeps no text whatever it was given`() {
        val excerpt = SearchExcerpt.of(text = "secret plan", veiled = true, media = SearchMediaKind.AUDIO)

        assertThat(excerpt).isEqualTo(SearchExcerpt.Veiled(media = SearchMediaKind.AUDIO))
        assertThat(excerpt.toString()).doesNotContain("secret")
    }

    @Test
    fun `an open excerpt shows its text with the media it was transcribed from`() {
        assertThat(SearchExcerpt.of(text = "demain", veiled = false, media = null))
            .isEqualTo(SearchExcerpt.Shown(text = "demain", media = null))
        assertThat(SearchExcerpt.of(text = "demain", veiled = false, media = SearchMediaKind.IMAGE).media)
            .isEqualTo(SearchMediaKind.IMAGE)
    }

    @Test
    fun `the spoken label of a veiled excerpt is the veiled label, never the text`() {
        val spoken = SearchExcerpt.Veiled(media = SearchMediaKind.AUDIO).spoken(veiledLabel = "Message flouté") { "Audio" }

        assertThat(spoken).isEqualTo("Message flouté")
    }

    @Test
    fun `the spoken label of a transcript names its media before the text`() {
        assertThat(SearchExcerpt.Shown("demain", SearchMediaKind.AUDIO).spoken("Message flouté") { "Audio" })
            .isEqualTo("Audio, demain")
        assertThat(SearchExcerpt.Shown("demain", null).spoken("Message flouté") { "Audio" })
            .isEqualTo("demain")
    }

    @Test
    fun `media kinds read the contract and an unknown kind is a document`() {
        assertThat(SearchMediaKind.of("audio")).isEqualTo(SearchMediaKind.AUDIO)
        assertThat(SearchMediaKind.of("video")).isEqualTo(SearchMediaKind.VIDEO)
        assertThat(SearchMediaKind.of("image")).isEqualTo(SearchMediaKind.IMAGE)
        assertThat(SearchMediaKind.of("document")).isEqualTo(SearchMediaKind.DOCUMENT)
        assertThat(SearchMediaKind.of("hologram")).isEqualTo(SearchMediaKind.DOCUMENT)
        assertThat(SearchMediaKind.of(null)).isEqualTo(SearchMediaKind.DOCUMENT)
    }
}
