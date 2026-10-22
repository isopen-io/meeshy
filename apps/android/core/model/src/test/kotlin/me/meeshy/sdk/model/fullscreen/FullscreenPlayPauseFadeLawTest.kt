package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import kotlin.time.Duration.Companion.seconds
import org.junit.Test

/**
 * Le bouton pause d'une vidéo plein écran s'efface vite et revient au doigt
 * (miroir de `FullscreenPlayPauseFade.swift`, #9577) : une seconde après le début
 * de la lecture, un toucher sur le média le ramène et réarme la seconde, et en
 * pause il reste — c'est la seule façon de reprendre.
 */
class FullscreenPlayPauseFadeLawTest {

    private val playing = FullscreenPlayPauseFadeLaw().playback(isPlaying = true)
    private val faded = playing.fading()

    @Test
    fun `a l'arret le bouton est visible et rien n'est a effacer`() {
        val initial = FullscreenPlayPauseFadeLaw()

        assertThat(initial.isVisible).isTrue()
        assertThat(initial.fadeDelay).isNull()
    }

    @Test
    fun `demarrer la lecture montre le bouton et arme la seconde`() {
        assertThat(playing.isVisible).isTrue()
        assertThat(playing.fadeDelay).isEqualTo(1.seconds)
    }

    @Test
    fun `au terme du delai le bouton s'efface`() {
        assertThat(faded.isVisible).isFalse()
        assertThat(faded.fadeDelay).isNull()
    }

    @Test
    fun `un toucher sur le media ramene le bouton et rearme la seconde`() {
        val touched = faded.tappingMedia()

        assertThat(touched.isVisible).isTrue()
        assertThat(touched.fadeDelay).isEqualTo(1.seconds)
        assertThat(touched.arming).isGreaterThan(faded.arming)
    }

    @Test
    fun `un toucher sur le media pendant que le bouton est visible reinitialise la seconde`() {
        val touched = playing.tappingMedia()

        assertThat(touched.arming).isGreaterThan(playing.arming)
        assertThat(touched.isVisible).isTrue()
    }

    @Test
    fun `un toucher sur le media a l'arret ne change rien`() {
        val initial = FullscreenPlayPauseFadeLaw()

        assertThat(initial.tappingMedia()).isEqualTo(initial)
    }

    @Test
    fun `en pause le bouton reste visible - c'est la seule facon de reprendre`() {
        val paused = faded.playback(isPlaying = false)

        assertThat(paused.isVisible).isTrue()
        assertThat(paused.fadeDelay).isNull()
    }

    @Test
    fun `mettre en pause pendant l'effacement ramene le bouton pour de bon`() {
        val paused = playing.playback(isPlaying = false)

        assertThat(paused.isVisible).isTrue()
        assertThat(paused.tappingMedia()).isEqualTo(paused)
    }

    @Test
    fun `reprendre la lecture reaffiche le bouton et rearme la seconde`() {
        val resumed = faded.playback(isPlaying = false).playback(isPlaying = true)

        assertThat(resumed.isVisible).isTrue()
        assertThat(resumed.fadeDelay).isEqualTo(1.seconds)
    }

    @Test
    fun `le moteur qui republie le meme etat de lecture n'est pas un changement`() {
        assertThat(playing.playback(isPlaying = true)).isEqualTo(playing)
        assertThat(faded.playback(isPlaying = true)).isEqualTo(faded)
        assertThat(FullscreenPlayPauseFadeLaw().playback(isPlaying = false)).isEqualTo(FullscreenPlayPauseFadeLaw())
    }

    @Test
    fun `l'effacement tardif apres une pause ne cache pas le bouton`() {
        val paused = playing.playback(isPlaying = false)

        assertThat(paused.fading()).isEqualTo(paused)
        assertThat(paused.fading().isVisible).isTrue()
    }

    @Test
    fun `l'effacement deja fait est idempotent`() {
        assertThat(faded.fading()).isEqualTo(faded)
    }

    @Test
    fun `chaque rearmement change la cle de la tache, sans minuteur a invalider`() {
        val keys = listOf(
            FullscreenPlayPauseFadeLaw().arming,
            playing.arming,
            playing.tappingMedia().arming,
            playing.tappingMedia().tappingMedia().arming,
        )

        assertThat(keys).containsNoDuplicates()
    }

    @Test
    fun `le delai du bouton pause est la cote de la table unique`() {
        assertThat(playing.fadeDelay).isEqualTo(FullscreenChromeMetrics.PLAY_PAUSE_FADE_DELAY)
    }
}
