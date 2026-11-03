package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sticker.MeeStickerMotionPolicy.Motion
import org.junit.Test

class MeeStickerMotionPolicyTest {
    private fun motion(
        reduce: Boolean = false,
        requested: Boolean = true,
        animated: Boolean = true,
        onScreen: Boolean = true,
        fast: Boolean = false,
    ) = MeeStickerMotionPolicy.motion(reduce, requested, animated, onScreen, fast)

    @Test
    fun `un film visible joue`() = assertThat(motion()).isEqualTo(Motion.PLAYING)

    @Test
    fun `les animations réduites donnent l'image fixe même visible`() = assertThat(motion(reduce = true)).isEqualTo(Motion.STATIC)

    @Test
    fun `une vignette sans mouvement demandé reste fixe`() = assertThat(motion(requested = false)).isEqualTo(Motion.STATIC)

    @Test
    fun `un film sans mouvement reste fixe`() = assertThat(motion(animated = false)).isEqualTo(Motion.STATIC)

    @Test
    fun `hors écran le film se met en pause`() = assertThat(motion(onScreen = false)).isEqualTo(Motion.PAUSED)

    @Test
    fun `dans une liste qui défile vite le film se met en pause`() = assertThat(motion(fast = true)).isEqualTo(Motion.PAUSED)

    @Test
    fun `les animations réduites l'emportent sur la pause`() = assertThat(motion(reduce = true, onScreen = false)).isEqualTo(Motion.STATIC)

    @Test
    fun `un Mee boucle et un identifiant inconnu aussi`() {
        assertThat(MeeStickerMotionPolicy.loops(MeeStickerCatalog.all.first { it.animated })).isTrue()
        assertThat(MeeStickerMotionPolicy.loops(null)).isTrue()
    }

    @Test
    fun `le décodage est plafonné à 360 et à 180 en grille`() {
        assertThat(MeeStickerMotionPolicy.decodePixelSize(1000f)).isEqualTo(360)
        assertThat(MeeStickerMotionPolicy.decodePixelSize(1000f, MeeStickerMotionPolicy.GRID_PIXEL_CAP)).isEqualTo(180)
        assertThat(MeeStickerMotionPolicy.decodePixelSize(96.2f)).isEqualTo(97)
    }

    @Test
    fun `une taille invalide donne un pixel`() {
        assertThat(MeeStickerMotionPolicy.decodePixelSize(0f)).isEqualTo(1)
        assertThat(MeeStickerMotionPolicy.decodePixelSize(Float.NaN)).isEqualTo(1)
    }

    @Test
    fun `le délai est de 150 ms et la case de 96 dp sur 3 colonnes`() {
        assertThat(MeeStickerMotionPolicy.FILM_DELAY_MILLIS).isEqualTo(150L)
        assertThat(MeeStickerMotionPolicy.CELL_SIDE_DP).isEqualTo(96)
        assertThat(MeeStickerMotionPolicy.COLUMNS).isEqualTo(3)
    }
}
