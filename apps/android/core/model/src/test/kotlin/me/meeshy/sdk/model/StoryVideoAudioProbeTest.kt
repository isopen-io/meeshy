package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryVideoAudioProbeTest {
    private fun video(id: String = "v") = StoryMediaObject(id = id, mediaType = "video", volume = 1f)

    @Test fun `la sonde rend null si l'url est absente`() {
        assertThat(StoryVideoAudioProbeLaw.trackCount(null) { 1 }).isNull()
        assertThat(StoryVideoAudioProbeLaw.trackCount("") { 1 }).isNull()
    }

    @Test fun `la sonde rend null si la lecture echoue ou leve`() {
        assertThat(StoryVideoAudioProbeLaw.trackCount("u") { null }).isNull()
        assertThat(StoryVideoAudioProbeLaw.trackCount("u") { error("injoignable") }).isNull()
    }

    @Test fun `la sonde rend le nombre de pistes`() {
        assertThat(StoryVideoAudioProbeLaw.trackCount("u") { 0 }).isEqualTo(0)
        assertThat(StoryVideoAudioProbeLaw.trackCount("u") { 2 }).isEqualTo(2)
    }

    @Test fun `aucun bouton son sur une story muette`() {
        val fx = StoryEffects(mediaObjects = listOf(video()))
        assertThat(StoryVideoAudioProbeLaw.showsSoundButton(fx, mapOf("v" to false), emptySet(), false)).isFalse()
        assertThat(StoryVideoAudioProbeLaw.showsSoundButton(fx, emptyMap(), emptySet(), false)).isFalse()
    }

    @Test fun `une sonde en echec conserve le bouton`() {
        val fx = StoryEffects(mediaObjects = listOf(video()))
        assertThat(StoryVideoAudioProbeLaw.showsSoundButton(fx, emptyMap(), setOf("v"), false)).isTrue()
    }

    @Test fun `un sondage reussi l'emporte sur un echec ancien`() {
        val fx = StoryEffects(mediaObjects = listOf(video()))
        assertThat(StoryVideoAudioProbeLaw.showsSoundButton(fx, mapOf("v" to false), setOf("v"), false)).isFalse()
        assertThat(StoryVideoAudioProbeLaw.showsSoundButton(fx, mapOf("v" to true), emptySet(), false)).isTrue()
    }
}
