package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StatusEntry
import org.junit.Test

/** La graine que la bulle d'humeur remet au composeur en feuille (iOS `ComposerMoodSeed` + origine `.repost`). */
class MoodRepublishSeedTest {
    private fun entry(content: String? = "en route", audioUrl: String? = null) = StatusEntry(
        id = "m9",
        userId = "u2",
        username = "ana",
        moodEmoji = "✈️",
        content = content,
        audioUrl = audioUrl,
        visibility = "PUBLIC",
    )

    @Test
    fun `la graine porte l emoji, le texte et le via pseudo de l humeur republiee`() {
        val seed = StatusComposerDraft.republish(entry())
        assertThat(seed.selectedEmoji).isEqualTo("✈️")
        assertThat(seed.text).isEqualTo("en route")
        assertThat(seed.viaUsername).isEqualTo("ana")
    }

    @Test
    fun `la graine garde l audio de l humeur vocale`() {
        assertThat(StatusComposerDraft.republish(entry(audioUrl = "https://cdn/m.m4a")).repostAudioUrl)
            .isEqualTo("https://cdn/m.m4a")
    }

    @Test
    fun `l origine repost designe l humeur source et la publication la transmet`() {
        val request = StatusComposerDraft.republish(entry()).publishRequest()!!
        assertThat(request.repostOfId).isEqualTo("m9")
        assertThat(request.viaUsername).isEqualTo("ana")
    }

    @Test
    fun `une humeur sans texte donne une graine sans texte`() {
        assertThat(StatusComposerDraft.republish(entry(content = null)).text).isEmpty()
    }
}
