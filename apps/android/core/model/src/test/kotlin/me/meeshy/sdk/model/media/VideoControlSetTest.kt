package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoControlSetTest {

    @Test
    fun `inlineDefault porte lecture, saut, barre, durée, plein écran, sortie et vitesse`() {
        val set = VideoControlSet.InlineDefault
        listOf(
            VideoControlSet.PlayPause, VideoControlSet.Skip, VideoControlSet.Scrubber, VideoControlSet.Duration,
            VideoControlSet.Expand, VideoControlSet.Airplay, VideoControlSet.Speed,
        ).forEach { assertThat(set.contains(it)).isTrue() }
        assertThat(set.contains(VideoControlSet.Mute)).isFalse()
    }

    @Test
    fun `inlineMinimal ne porte que le son, la lecture et le plein écran`() {
        val set = VideoControlSet.InlineMinimal
        assertThat(set).isEqualTo(VideoControlSet.Mute + VideoControlSet.PlayPause + VideoControlSet.Expand)
        listOf(VideoControlSet.Skip, VideoControlSet.Scrubber, VideoControlSet.Duration, VideoControlSet.Speed, VideoControlSet.Pip)
            .forEach { assertThat(set.contains(it)).isFalse() }
    }

    @Test
    fun `aucun jeu en ligne n'ouvre le PiP`() {
        assertThat(VideoControlSet.InlineDefault.contains(VideoControlSet.Pip)).isFalse()
        assertThat(VideoControlSet.InlineMinimal.contains(VideoControlSet.Pip)).isFalse()
        assertThat(VideoControlSet.FullscreenDefault.contains(VideoControlSet.Pip)).isTrue()
    }

    @Test
    fun `l'aperçu plein écran retire enregistrer, partager, auteur et boucle`() {
        val preview = VideoControlSet.FullscreenPreview
        listOf(VideoControlSet.Save, VideoControlSet.Share, VideoControlSet.Author, VideoControlSet.Loop)
            .forEach { assertThat(preview.contains(it)).isFalse() }
        assertThat(preview.contains(VideoControlSet.PlayPause)).isTrue()
    }

    @Test
    fun `none est vide et minus retire`() {
        assertThat(VideoControlSet.None.isEmpty).isTrue()
        assertThat((VideoControlSet.InlineMinimal - VideoControlSet.Mute).contains(VideoControlSet.Mute)).isFalse()
    }
}
