package me.meeshy.ui.appearance

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.BannerFrameDesign
import me.meeshy.sdk.model.appearance.BannerFrameRenderer
import org.junit.Test

/** Les 7 packs embarqués (2 cadres chacun) se mettent en place au gabarit 300 x 100 du catalogue. */
class BannerFrameGeometryTest {

    private val frames: List<BannerFrameDesign> by lazy {
        val relative = "sdk-core/src/main/assets/appearance-catalog.json"
        val file = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8)
            .flatMap { sequenceOf(File(it, relative), File(it, "apps/android/$relative")) }
            .first { it.isFile }
        AppearanceCatalog.decodeOrEmpty(file.readText()) { error(it) }.bannerFramePacks.flatMap { it.frames }
    }

    @Test
    fun `les sept packs embarques portent quatorze cadres`() {
        assertThat(frames).hasSize(14)
    }

    @Test
    fun `chaque cadre pose des elements au gabarit 300 x 100`() {
        frames.forEach { frame ->
            val elements = BannerFrameRenderer.elements(frame, 300.0)
            assertThat(elements).isNotEmpty()
        }
    }

    @Test
    fun `les elements des frises tiennent entre les marges du cadre`() {
        frames.filter { it.friezes.isNotEmpty() }.forEach { frame ->
            val friezePaths = frame.friezes.sumOf { it.paths.size }
            val elements = BannerFrameRenderer.elements(frame, 300.0)
            assertThat(elements.size).isAtLeast(friezePaths)
        }
    }

    @Test
    fun `aucun point du centre transparent n'est couvert par la decoupe`() {
        frames.forEach { frame ->
            listOf(300.0, 360.0, 450.0).forEach { width ->
                val clip = BannerFrameRenderer.clip(frame, width)
                val from = BannerFrameDesign.MAX_REACH + 1
                val xs = generateSequence(from) { it + 7.0 }.takeWhile { it < width - from }
                xs.forEach { x ->
                    val ys = generateSequence(from) { it + 5.0 }.takeWhile { it < 100.0 - from }
                    ys.forEach { y -> assertThat(clip.covers(x, y)).isFalse() }
                }
            }
        }
    }

    @Test
    fun `en lecture de droite a gauche l'ordre des pieces est miroite`() {
        frames.filter { frame -> frame.pieces.any { it.paths.isNotEmpty() } }.forEach { frame ->
            val normal = BannerFrameRenderer.elements(frame, 300.0)
            val mirrored = BannerFrameRenderer.elements(frame, 300.0, mirrored = true)
            assertThat(mirrored).hasSize(normal.size)
            normal.zip(mirrored).forEach { (a, b) ->
                val boundsA = a.bounds ?: return@forEach
                val boundsB = b.bounds ?: return@forEach
                assertThat(boundsB.minX).isWithin(1e-6).of(300.0 - boundsA.maxX)
                assertThat(boundsB.maxX).isWithin(1e-6).of(300.0 - boundsA.minX)
            }
        }
    }
}
