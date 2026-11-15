package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13897 — une vidéo POSÉE sur la scène s'exporte vivante : visible là où le lecteur la montre, lue dans la fenêtre que
 * l'auteur a coupée, en boucle sur sa présence à l'écran comme le lecteur (`REPEAT_MODE_ONE`).
 */
class StoryExportPlacedVideoClockTest {

    private fun clock(
        slideStart: Long = 6_000,
        slideDuration: Long = 8_218,
        objectStart: Double = 0.0,
        objectDuration: Double = 0.0,
        trimStart: Long? = null,
        trimEnd: Long? = null,
        clip: Long = 8_200,
    ) = StoryExportPlacedVideoClock.of(slideStart, slideDuration, objectStart, objectDuration, trimStart, trimEnd, clip)

    @Test fun `une video posee sans fenetre de temps tient toute sa slide, a l heure de la composition`() {
        val placed = clock()!!
        assertThat(placed.startMillis).isEqualTo(6_000)
        assertThat(placed.endMillis).isEqualTo(14_218)
        assertThat(placed.window).isEqualTo(StoryExportClipRange(0, 8_200))
        assertThat(placed.sourceAt(6_000)).isEqualTo(0)
        assertThat(placed.sourceAt(10_000)).isEqualTo(4_000)
        assertThat(placed.sourceAt(5_999)).isNull()
        assertThat(placed.sourceAt(14_218)).isNull()
    }

    @Test fun `la fenetre coupee se lit en boucle sur la presence de l objet`() {
        val placed = clock(objectStart = 1.0, objectDuration = 5.0, trimStart = 2_000, trimEnd = 4_000)!!
        assertThat(placed.startMillis).isEqualTo(7_000)
        assertThat(placed.endMillis).isEqualTo(12_000)
        assertThat(placed.sourceAt(7_000)).isEqualTo(2_000)
        assertThat(placed.sourceAt(8_500)).isEqualTo(3_500)
        assertThat(placed.sourceAt(9_000)).isEqualTo(2_000)
        assertThat(placed.sourceAt(11_999)).isEqualTo(2_999)
        assertThat(placed.sourceAt(12_000)).isNull()
    }

    @Test fun `une presence plus longue que la slide s arrete a la fin de la slide`() {
        val placed = clock(objectStart = 6.0, objectDuration = 30.0)!!
        assertThat(placed.startMillis).isEqualTo(12_000)
        assertThat(placed.endMillis).isEqualTo(14_218)
    }

    @Test fun `une coupe vieillie hors du fichier relit le fichier entier`() {
        assertThat(clock(trimStart = 9_000, trimEnd = 12_000)!!.window).isEqualTo(StoryExportClipRange(0, 8_200))
        assertThat(clock(trimStart = 1_000, trimEnd = 20_000)!!.window).isEqualTo(StoryExportClipRange(1_000, 8_200))
    }

    @Test fun `un objet qui entre apres la fin de la slide ou un fichier sans duree ne se pose pas`() {
        assertThat(clock(objectStart = 9.0)).isNull()
        assertThat(clock(clip = 0)).isNull()
    }
}
