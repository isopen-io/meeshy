package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import kotlin.math.abs
import me.meeshy.sdk.model.call.frames.CallFrameRect
import org.junit.Test

/** Portage de `CallMontageLayoutTests.swift` : les treize montages, une case par personne, sur la toile. */
class CallMontageLayoutTest {

    private val canvas = CallMontageLayout.captureSize
    private val bounds = canvas.bounds

    private fun slots(style: CallMontageStyle, count: Int) = CallMontageLayout.frames(style, count, canvas)

    private fun dimensions(count: Int) = CallMontageLayout.gridDimensions(count).let { listOf(it.first, it.second) }

    private fun overlaps(frames: List<CallFrameRect>): Boolean =
        frames.withIndex().any { (index, frame) ->
            frames.drop(index + 1).any { it.insetBy(0.5, 0.5).intersects(frame.insetBy(0.5, 0.5)) }
        }

    private fun near(actual: Double, expected: Double, tolerance: Double) = abs(actual - expected) <= tolerance

    @Test
    fun `les styles suivent l ordre du design partage`() {
        assertThat(CallMontageStyle.entries.map { it.raw }).containsExactly(
            "screen", "cover", "gold", "redcarpet", "grid", "strip", "polaroid", "magazine", "film", "neon", "noir", "comic", "heart",
        ).inOrder()
    }

    @Test
    fun `la toile de capture est un portrait Full HD`() {
        assertThat(CallMontageLayout.captureSize).isEqualTo(CallMontageCanvas(1080.0, 1920.0))
        assertThat(CallMontageLayout.FACE_SIDE).isEqualTo(1080)
    }

    @Test
    fun `sans personne ou sur une toile vide, aucune case`() {
        assertThat(CallMontageStyle.entries.all { slots(it, 0).isEmpty() }).isTrue()
        assertThat(CallMontageLayout.frames(CallMontageStyle.GRID, 3, CallMontageCanvas(0.0, 0.0))).isEmpty()
    }

    @Test
    fun `une case par personne pour chaque style et chaque nombre`() {
        CallMontageStyle.entries.forEach { style ->
            (1..CallMontageLayout.MAX_PARTICIPANTS).forEach { count ->
                assertWithMessage("$style × $count").that(slots(style, count)).hasSize(count)
            }
        }
    }

    @Test
    fun `au dela de douze, le montage plafonne`() {
        assertThat(slots(CallMontageStyle.GRID, 40)).hasSize(CallMontageLayout.MAX_PARTICIPANTS)
    }

    @Test
    fun `chaque case reste sur la toile et a une aire`() {
        CallMontageStyle.entries.forEach { style ->
            (1..CallMontageLayout.MAX_PARTICIPANTS).forEach { count ->
                slots(style, count).forEach { slot ->
                    assertWithMessage("$style × $count : ${slot.frame}").that(bounds.insetBy(-0.5, -0.5).contains(slot.frame)).isTrue()
                    assertThat(slot.frame.width).isGreaterThan(0.0)
                    assertThat(slot.frame.height).isGreaterThan(0.0)
                }
            }
        }
    }

    @Test
    fun `les cases suivent l echelle de la toile`() {
        val small = CallMontageCanvas(108.0, 192.0)
        CallMontageStyle.entries.forEach { style ->
            val big = CallMontageLayout.frames(style, 3, canvas).map { it.frame }
            val thumb = CallMontageLayout.frames(style, 3, small).map { it.frame }
            big.zip(thumb).forEach { (large, tiny) ->
                assertWithMessage("$style").that(near(tiny.minX * 10, large.minX, 0.01)).isTrue()
                assertWithMessage("$style").that(near(tiny.width * 10, large.width, 0.01)).isTrue()
            }
        }
    }

    @Test
    fun `l Ecran seul est un ecran dans un bord de 3 pour cent aux coins concentriques`() {
        val slot = slots(CallMontageStyle.SCREEN, 1).single()
        val bezel = bounds.width * 0.03
        assertThat(slot.shape).isEqualTo(CallMontageShape.ROUNDED_RECTANGLE)
        assertThat(slot.frame).isEqualTo(bounds.insetBy(bezel, bezel))
        assertThat(near(slot.cornerRadius + bezel, bounds.width * 0.115, 0.01)).isTrue()
    }

    @Test
    fun `la barre d etat de l Ecran seul est en haut de l ecran, et le reflet n en deborde pas`() {
        val solo = CallMontageSoloLayout.screen(bounds)
        assertThat(near(solo.statusBand.minY, solo.screen.minY, 0.01)).isTrue()
        assertThat(near(solo.statusBand.minX, solo.screen.minX, 0.01)).isTrue()
        assertThat(near(solo.statusBand.width, solo.screen.width, 0.01)).isTrue()
        assertThat(solo.statusBand.height).isGreaterThan(0.0)
        assertThat(solo.statusBand.height).isLessThan(solo.screen.height * 0.06)
        assertThat(solo.reflection.size).isAtLeast(3)
        assertThat(solo.reflection.all { solo.screen.insetBy(-0.5, -0.5).contains(it) }).isTrue()
    }

    @Test
    fun `l Ecran a deux montre l autre en plein et soi en incrustation`() {
        val duo = slots(CallMontageStyle.SCREEN, 2)
        assertThat(duo[0].frame).isEqualTo(bounds)
        assertThat(duo[1].shape).isEqualTo(CallMontageShape.ROUNDED_RECTANGLE)
        assertThat(duo[1].frame.width).isLessThan(bounds.width / 3)
        assertThat(duo[1].frame.midX).isGreaterThan(bounds.midX)
        assertThat(duo[1].frame.midY).isGreaterThan(bounds.midY)
        assertThat(near(duo[1].frame.height / duo[1].frame.width, 16.0 / 9, 0.001)).isTrue()
    }

    @Test
    fun `l Ecran en groupe pave sans chevauchement`() {
        assertThat(overlaps(slots(CallMontageStyle.SCREEN, 5).map { it.frame })).isFalse()
    }

    @Test
    fun `la Mosaique ne chevauche jamais et centre la derniere rangee`() {
        (1..CallMontageLayout.MAX_PARTICIPANTS).forEach { count ->
            assertWithMessage("$count").that(overlaps(slots(CallMontageStyle.GRID, count).map { it.frame })).isFalse()
        }
        val five = slots(CallMontageStyle.GRID, 5).map { it.frame }
        assertThat(near(five[4].midX, bounds.midX, 0.5)).isTrue()
    }

    @Test
    fun `la Mosaique seule decoupe la photo en 3 x 5 carreaux separes de joints de 0,006 u`() {
        val solo = CallMontageSoloLayout.mosaic(bounds)
        assertThat(listOf(solo.columns, solo.rows)).containsExactly(3, 5).inOrder()
        assertThat(solo.tiles).hasSize(15)
        assertThat(near(solo.joint, bounds.width * 0.006, 0.0001)).isTrue()
        assertThat(overlaps(solo.tiles)).isFalse()
        assertThat(solo.tiles.all { solo.slot.insetBy(-0.01, -0.01).contains(it) }).isTrue()
        assertThat(near(solo.tiles[1].minX - solo.tiles[0].maxX, solo.joint, 0.001)).isTrue()
        assertThat(near(solo.tiles[3].minY - solo.tiles[0].maxY, solo.joint, 0.001)).isTrue()
        val tiles = solo.tiles.sumOf { it.width * it.height }
        val joints = solo.joint * solo.slot.height * 2 + solo.joint * solo.slot.width * 4 - solo.joint * solo.joint * 8
        assertWithMessage("l union des carreaux est la case moins ses joints")
            .that(near(tiles, solo.slot.width * solo.slot.height - joints, 1.0)).isTrue()
        assertThat(solo.band.height).isGreaterThan(solo.joint * 4)
        assertThat(near(solo.band.minY, solo.slot.maxY, 0.01)).isTrue()
        assertThat(near(solo.band.maxY, bounds.maxY, 0.01)).isTrue()
    }

    @Test
    fun `la case de la Mosaique seule est celle du montage a une personne`() {
        assertThat(slots(CallMontageStyle.GRID, 1).single().frame).isEqualTo(CallMontageSoloLayout.mosaic(bounds).slot)
    }

    @Test
    fun `en paysage la Mosaique seule inverse le pavage, pres du carre elle passe en 4 x 4`() {
        val landscape = CallMontageSoloLayout.mosaic(CallFrameRect(0.0, 0.0, 1920.0, 1080.0))
        assertThat(listOf(landscape.columns, landscape.rows)).containsExactly(5, 3).inOrder()
        val square = CallMontageSoloLayout.mosaic(CallFrameRect(0.0, 0.0, 1080.0, 1080.0))
        assertThat(listOf(square.columns, square.rows)).containsExactly(4, 4).inOrder()
        assertThat(CallMontageSoloLayout.mosaic(CallFrameRect(0.0, 0.0, 1080.0, 1350.0)).tiles).hasSize(16)
    }

    @Test
    fun `les teintes des carreaux sont deterministes et deux voisins different`() {
        listOf(3 to 5, 5 to 3, 4 to 4).forEach { (columns, rows) ->
            (0 until rows).forEach { row ->
                (0 until columns).forEach { column ->
                    val tint = CallMontageSoloLayout.tint(row, column)
                    assertThat(CallMontageSoloLayout.tint(row, column)).isEqualTo(tint)
                    if (column + 1 < columns) assertThat(CallMontageSoloLayout.tint(row, column + 1)).isNotEqualTo(tint)
                    if (row + 1 < rows) assertThat(CallMontageSoloLayout.tint(row + 1, column)).isNotEqualTo(tint)
                }
            }
        }
        assertThat(CallMontageTint.entries.all { it.alpha in 0.0..0.08 }).isTrue()
    }

    @Test
    fun `la grille grandit avec le groupe`() {
        assertThat(dimensions(1)).containsExactly(1, 1).inOrder()
        assertThat(dimensions(2)).containsExactly(1, 2).inOrder()
        assertThat(dimensions(4)).containsExactly(2, 2).inOrder()
        assertThat(dimensions(6)).containsExactly(2, 3).inOrder()
        assertThat(dimensions(9)).containsExactly(3, 3).inOrder()
        assertThat(dimensions(11)).containsExactly(3, 4).inOrder()
    }

    @Test
    fun `le Photomaton empile des cadres paysage de haut en bas et laisse le pied au titre`() {
        val frames = slots(CallMontageStyle.STRIP, 4).map { it.frame }
        assertThat(frames.all { abs(it.height / it.width - 0.75) < 0.001 }).isTrue()
        assertThat(frames.map { it.minY }).isInOrder()
        assertThat(overlaps(frames)).isFalse()
        val band = CallMontageLayout.captionBand(CallMontageStyle.STRIP, canvas)!!
        assertThat(slots(CallMontageStyle.STRIP, 4).all { it.frame.maxY <= band.minY }).isTrue()
        assertThat(slots(CallMontageStyle.STRIP, 6).map { it.frame.minX.toInt() }.toSet()).hasSize(2)
    }

    @Test
    fun `le Polaroid pose des photos carrees inclinees, en cartes separees sur la toile`() {
        val cards = slots(CallMontageStyle.POLAROID, 4)
        assertThat(cards.all { abs(it.frame.width - it.frame.height) < 0.001 }).isTrue()
        assertThat(cards.all { it.rotation != 0.0 }).isTrue()
        assertThat(Math.signum(cards[0].rotation)).isNotEqualTo(Math.signum(cards[1].rotation))
        (1..CallMontageLayout.MAX_PARTICIPANTS).forEach { count ->
            val around = slots(CallMontageStyle.POLAROID, count).map { CallMontageLayout.polaroidCard(it.frame) }
            assertWithMessage("$count").that(around.all { bounds.contains(it) }).isTrue()
            assertWithMessage("$count").that(overlaps(around)).isFalse()
        }
    }

    @Test
    fun `la carte Polaroid a le large bord bas`() {
        val photo = CallFrameRect(100.0, 100.0, 500.0, 500.0)
        val card = CallMontageLayout.polaroidCard(photo)
        assertThat(card.contains(photo)).isTrue()
        assertThat(card.maxY - photo.maxY).isGreaterThan((photo.minY - card.minY) * 2)
        assertThat(near(card.midX, photo.midX, 0.001)).isTrue()
    }

    @Test
    fun `le Magazine fait de la premiere la couverture et des autres des medaillons, sous le titre en haut`() {
        val cover = slots(CallMontageStyle.MAGAZINE, 4)
        assertThat(cover[0].frame).isEqualTo(bounds)
        val insets = cover.drop(1)
        assertThat(insets.all { it.shape == CallMontageShape.CIRCLE && it.frame.width == it.frame.height }).isTrue()
        assertThat(overlaps(insets.map { it.frame })).isFalse()
        assertThat(insets.all { it.frame.minY > bounds.midY }).isTrue()
        assertThat(CallMontageLayout.captionBand(CallMontageStyle.MAGAZINE, canvas)!!.maxY).isLessThan(canvas.height * 0.2)
    }

    @Test
    fun `la BD a trois cases pose une large en haut et deux dessous, dans une gouttiere`() {
        val panels = slots(CallMontageStyle.COMIC, 3).map { it.frame }
        assertThat(panels[0].width).isGreaterThan(panels[1].width * 1.9)
        assertThat(near(panels[1].minY, panels[2].minY, 0.001)).isTrue()
        assertThat(panels[1].minY).isGreaterThan(panels[0].maxY)
        assertThat(overlaps(panels)).isFalse()
        assertThat(slots(CallMontageStyle.COMIC, 4).all { it.frame.minX > 0 && it.frame.maxX < bounds.maxX }).isTrue()
    }

    @Test
    fun `le Coeur pose des coeurs carres, et seul il est grand et centre`() {
        listOf(1, 2, 5).forEach { count ->
            val hearts = slots(CallMontageStyle.HEART, count)
            assertWithMessage("$count").that(hearts.all { it.shape == CallMontageShape.HEART && abs(it.frame.width - it.frame.height) < 0.001 }).isTrue()
            assertWithMessage("$count").that(overlaps(hearts.map { it.frame })).isFalse()
        }
        val heart = slots(CallMontageStyle.HEART, 1)[0].frame
        assertThat(near(heart.midX, bounds.midX, 0.001)).isTrue()
        assertThat(heart.width).isGreaterThan(bounds.width * 0.8)
    }

    private val glamour = listOf(
        CallMontageStyle.COVER, CallMontageStyle.GOLD, CallMontageStyle.REDCARPET,
        CallMontageStyle.FILM, CallMontageStyle.NEON, CallMontageStyle.NOIR,
    )

    @Test
    fun `le glamour ne chevauche jamais, et ses titres ne couvrent aucun visage`() {
        glamour.forEach { style ->
            (1..CallMontageLayout.MAX_PARTICIPANTS).forEach { count ->
                assertWithMessage("$style × $count").that(overlaps(slots(style, count).map { it.frame })).isFalse()
            }
        }
        glamour.filter { it != CallMontageStyle.FILM }.forEach { style ->
            val band = CallMontageLayout.captionBand(style, canvas)!!
            (1..CallMontageLayout.MAX_PARTICIPANTS).forEach { count ->
                assertWithMessage("$style × $count").that(slots(style, count).none { it.frame.intersects(band) }).isTrue()
            }
        }
    }

    @Test
    fun `la Couverture mene par un heros, les autres en medaillons dessous`() {
        val cover = slots(CallMontageStyle.COVER, 5)
        val medallions = cover.drop(1)
        assertThat(medallions.all { it.shape == CallMontageShape.CIRCLE && abs(it.frame.width - it.frame.height) < 0.001 }).isTrue()
        assertThat(medallions.all { it.frame.width < cover[0].frame.width / 3 }).isTrue()
        assertThat(medallions.all { it.frame.minY > cover[0].frame.maxY }).isTrue()
        val hero = slots(CallMontageStyle.COVER, 1)[0].frame
        assertThat(hero.height).isGreaterThan(bounds.height * 0.7)
        assertThat(near(hero.midX, bounds.midX, 0.001)).isTrue()
    }

    @Test
    fun `l Or pose des camees ovales`() {
        val cameos = slots(CallMontageStyle.GOLD, 4)
        assertThat(cameos.all { it.shape == CallMontageShape.CIRCLE }).isTrue()
        assertThat(cameos.all { abs(it.frame.height / it.frame.width - CallMontageLayout.GOLD_CAMEO_ASPECT) < 0.001 }).isTrue()
    }

    @Test
    fun `le Tapis rouge a quatre tient sur une ligne de portraits`() {
        val line = slots(CallMontageStyle.REDCARPET, 4)
        assertThat(line.map { Math.round(it.frame.minY) }.toSet()).hasSize(1)
        assertThat(line.map { it.frame.minX }).isInOrder()
        assertThat(line.all { it.frame.height > it.frame.width }).isTrue()
    }

    @Test
    fun `la Pellicule pose des cadres paysage dans leur bande, et deux bandes pour un grand groupe`() {
        listOf(1, 4, 7, 12).forEach { count ->
            val strips = CallMontageLayout.filmStrips(count, canvas)
            val frames = slots(CallMontageStyle.FILM, count).map { it.frame }
            assertWithMessage("$count").that(frames.all { abs(it.height / it.width - CallMontageLayout.FILM_FRAME_ASPECT) < 0.001 }).isTrue()
            assertWithMessage("$count").that(frames.all { frame -> strips.any { it.contains(frame) } }).isTrue()
        }
        assertThat(CallMontageLayout.filmStrips(3, canvas)).hasSize(1)
        assertThat(CallMontageLayout.filmStrips(8, canvas)).hasSize(2)
        assertThat(CallMontageLayout.filmStrips(0, canvas)).isEmpty()
    }
}
