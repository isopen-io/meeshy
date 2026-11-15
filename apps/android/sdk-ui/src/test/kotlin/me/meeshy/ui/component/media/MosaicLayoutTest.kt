package me.meeshy.ui.component.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MosaicLayoutMode
import org.junit.Test

/**
 * La géométrie des agencements d'une publication (#6514), cotes reprises de
 * `MosaicLayout.swift` (`packages/MeeshySDK/Sources/MeeshyUI/Story/`) — la
 * même que celle que `apps/web/src/lib/feed/mosaic-layout.ts` dérive. Les
 * cadres sont des FRACTIONS de la boîte de la mosaïque.
 */
class MosaicLayoutTest {

    private data class Frame(val index: Int, val x: Float, val y: Float, val width: Float, val height: Float, val overflow: Int)

    private fun MosaicTile.rounded() = Frame(
        index = index,
        x = round3(x),
        y = round3(y),
        width = round3(width),
        height = round3(height),
        overflow = overflow,
    )

    private fun round3(value: Float): Float = Math.round(value * 1000f) / 1000f

    private fun tiled(count: Int, mode: MosaicLayoutMode): MosaicArrangement.Tiled =
        MosaicLayout.arrange(count, mode) as MosaicArrangement.Tiled

    @Test
    fun `hero a trois visuels pose une grande tuile de 0,62 et deux satellites en colonne`() {
        val arrangement = tiled(3, MosaicLayoutMode.HERO)

        assertThat(arrangement.tiles.map { it.rounded() }).containsExactly(
            Frame(0, 0f, 0f, 0.62f, 1f, 0),
            Frame(1, 0.634f, 0f, 0.366f, 0.493f, 0),
            Frame(2, 0.634f, 0.507f, 0.366f, 0.493f, 0),
        ).inOrder()
        assertThat(arrangement.aspectRatio).isEqualTo(0.82f)
        assertThat(arrangement.span).isEqualTo(1f)
    }

    @Test
    fun `wave a quatre visuels garde la largeur et fait onduler les hauteurs`() {
        assertThat(tiled(4, MosaicLayoutMode.WAVE).tiles.map { it.rounded() }).containsExactly(
            Frame(0, 0f, 0f, 0.24f, 1f, 0),
            Frame(1, 0.254f, 0.13f, 0.24f, 0.74f, 0),
            Frame(2, 0.507f, 0f, 0.24f, 1f, 0),
            Frame(3, 0.761f, 0.13f, 0.24f, 0.74f, 0),
        ).inOrder()
    }

    @Test
    fun `sine a trois visuels saute d'un bord a l'autre`() {
        val tiles = tiled(3, MosaicLayoutMode.SINE).tiles.map { it.rounded() }

        assertThat(tiles.map { it.y }).containsExactly(0f, 0.38f, 0f).inOrder()
        assertThat(tiles.map { it.height }.distinct()).containsExactly(0.62f)
    }

    @Test
    fun `reel deborde a droite au pas de 0,628 et sa boite defile`() {
        val arrangement = tiled(3, MosaicLayoutMode.REEL)

        assertThat(arrangement.tiles.map { listOf(round3(it.x), round3(it.width), round3(it.height)) })
            .containsExactly(listOf(0f, 0.6f, 1f), listOf(0.628f, 0.6f, 1f), listOf(1.256f, 0.6f, 1f))
            .inOrder()
        assertThat(round3(arrangement.span)).isEqualTo(1.856f)
    }

    @Test
    fun `chaque mosaique declare le rapport hauteur sur largeur de sa boite`() {
        assertThat(tiled(2, MosaicLayoutMode.WAVE).aspectRatio).isEqualTo(0.78f)
        assertThat(tiled(2, MosaicLayoutMode.HERO).aspectRatio).isEqualTo(0.82f)
        assertThat(tiled(2, MosaicLayoutMode.REEL).aspectRatio).isEqualTo(1.05f)
        assertThat(tiled(2, MosaicLayoutMode.SINE).aspectRatio).isEqualTo(0.92f)
    }

    @Test
    fun `au-dela de quatre les mosaiques comptent le reste sur la derniere tuile seule`() {
        val tiles = tiled(6, MosaicLayoutMode.HERO).tiles

        assertThat(tiles).hasSize(4)
        assertThat(tiles.map { it.overflow }).containsExactly(0, 0, 0, 2).inOrder()
    }

    @Test
    fun `le carrousel pagine tous les visuels sans rien cacher`() {
        assertThat(MosaicLayout.arrange(6, MosaicLayoutMode.CAROUSEL)).isEqualTo(MosaicArrangement.Paged(pageCount = 6))
    }

    /** Une mosaïque d'un élément n'en est pas une, quel que soit le mode. */
    @Test
    fun `aucun visuel ne pose rien et un seul visuel reste seul`() {
        MosaicLayoutMode.entries.forEach { mode ->
            assertThat(MosaicLayout.arrange(0, mode)).isEqualTo(MosaicArrangement.Empty)
            assertThat(MosaicLayout.arrange(1, mode)).isEqualTo(MosaicArrangement.Single)
        }
    }

    @Test
    fun `seules la grande tuile d'un hero, les tuiles d'un reel et une page portent une legende`() {
        assertThat(MosaicLayout.tileCarriesCaption(MosaicLayoutMode.HERO, index = 0, count = 3)).isTrue()
        assertThat(MosaicLayout.tileCarriesCaption(MosaicLayoutMode.HERO, index = 1, count = 3)).isFalse()
        assertThat(MosaicLayout.tileCarriesCaption(MosaicLayoutMode.REEL, index = 2, count = 3)).isTrue()
        assertThat(MosaicLayout.tileCarriesCaption(MosaicLayoutMode.CAROUSEL, index = 2, count = 3)).isTrue()
        assertThat(MosaicLayout.tileCarriesCaption(MosaicLayoutMode.WAVE, index = 0, count = 3)).isFalse()
        assertThat(MosaicLayout.tileCarriesCaption(MosaicLayoutMode.SINE, index = 0, count = 3)).isFalse()
        assertThat(MosaicLayout.tileCarriesCaption(MosaicLayoutMode.WAVE, index = 0, count = 1)).isTrue()
    }

    @Test
    fun `le budget de mots se reduit a la part de la rangee, jamais sous deux mots`() {
        assertThat(MosaicLayout.captionWordLimit(MosaicLayoutMode.HERO, count = 3, tileWidth = 0.62f)).isEqualTo(5)
        assertThat(MosaicLayout.captionWordLimit(MosaicLayoutMode.REEL, count = 3, tileWidth = 0.6f)).isEqualTo(12)
        assertThat(MosaicLayout.captionWordLimit(MosaicLayoutMode.WAVE, count = 4, tileWidth = 0.2395f)).isEqualTo(2)
        assertThat(MosaicLayout.captionWordLimit(MosaicLayoutMode.HERO, count = 1, tileWidth = 1f)).isEqualTo(20)
    }

    @Test
    fun `une legende se tronque en mots, jamais en lignes`() {
        assertThat(MosaicLayout.truncateWords("un deux trois quatre", limit = 2)).isEqualTo("un deux…")
        assertThat(MosaicLayout.truncateWords("  un   deux ", limit = 2)).isEqualTo("  un   deux ")
    }
}
