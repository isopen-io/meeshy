package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import org.junit.Test

class FocalElectedLoupeTest {

    private val heights = listOf(44.0, 60.0, 140.0, 420.0)
    private val scales = listOf(
        1.0,
        FocalScrollPerspective.electedScale(reduceMotion = false, rowWidth = 390.0),
        1 + FocalMetrics.Focus.LOUPE_GAIN,
    )

    @Test
    fun `seul le contenu de l elu grandit tandis que l identite et la bande gardent leur gabarit`() {
        for (head in listOf(true, false)) for (scale in scales) {
            val g = FocalScrollPerspective.electedGeometry(head, 140.0, scale)
            val unscaled = FocalScrollPerspective.electedGeometry(head, 140.0, 1.0)
            assertThat(g.identityChip.bottom - g.identityChip.top)
                .isWithin(1e-3).of(FocalMetrics.FocusStrip.IDENTITY_CHIP_HEIGHT)
            assertThat(g.strip.bottom - g.strip.top).isWithin(1e-3).of(FocalMetrics.FocusStrip.CHIP_HEIGHT)
            assertThat(g.content.bottom - g.content.top)
                .isWithin(1e-3).of(scale * (unscaled.content.bottom - unscaled.content.top))
        }
    }

    @Test
    fun `le cadre est aere en haut et en bas du contenu grossi`() {
        val pad = FocalMetrics.Row.PADDING_VERTICAL
        val breathing = FocalScrollPerspective.ELECTED_CONTENT_BREATHING
        assertThat(breathing).isGreaterThan(0.0)
        for (head in listOf(true, false)) for (height in heights) for (scale in scales) {
            val g = FocalScrollPerspective.electedGeometry(head, height, scale)
            val label = "tete=$head h=$height loupe=$scale"
            assertWithMessage("$label identite collee").that(g.content.top - g.identityChip.bottom)
                .isAtLeast(pad + breathing - 1e-3)
            assertWithMessage("$label bande collee").that(g.strip.top - g.content.bottom)
                .isWithin(1e-3).of(FocalMetrics.FocusStrip.STRIP_GAP + breathing)
            assertWithMessage("$label marge haute").that(g.identityChip.top - g.card.top)
                .isWithin(1e-3).of(FocalScrollPerspective.ELECTED_CARD_MARGIN)
            assertWithMessage("$label marge basse").that(g.card.bottom - g.strip.bottom)
                .isWithin(1e-3).of(FocalScrollPerspective.ELECTED_CARD_MARGIN)
        }
    }

    @Test
    fun `la zone de toucher debordante couvre le cadre entier`() {
        for (head in listOf(true, false)) for (height in heights) {
            val g = FocalScrollPerspective.electedGeometry(head, height, 1.26)
            val overflow = FocalScrollPerspective.electedTouchOverflow(g, height)
            assertThat(g.strip.bottom).isGreaterThan(height)
            assertThat(overflow.bottom).isWithin(1e-3).of(g.card.bottom - height)
            assertThat(overflow.top).isWithin(1e-3).of(maxOf(0.0, -g.card.top))
        }
    }

    @Test
    fun `l echelle de l elu cible un gain de vingt pour cent de plus que la loupe du deplie`() {
        assertThat(1 + FocalMetrics.Focus.LOUPE_GAIN)
            .isWithin(1e-3).of((1 + FocalMetrics.Focus.EXPANDED_LOUPE_GAIN) * 1.2)
    }

    @Test
    fun `l echelle de l elu est pleine sur un petit ecran et ne depend jamais de la hauteur`() {
        assertThat(FocalScrollPerspective.electedScale(false, 320.0))
            .isWithin(1e-4).of(1 + FocalMetrics.Focus.LOUPE_GAIN)
        val phone = FocalScrollPerspective.electedScale(false, 390.0)
        assertThat(phone).isGreaterThan(1.2)
        assertThat(phone).isAtMost(1 + FocalMetrics.Focus.LOUPE_GAIN)
    }

    @Test
    fun `le cadre agrandi ne sort jamais de l ecran en LTR comme en RTL`() {
        val inset = FocalScrollPerspective.FOCUS_CARD_HORIZONTAL_INSET
        val margin = FocalScrollPerspective.ELECTED_CARD_MARGIN
        for (width in listOf(320.0, 375.0, 390.0, 393.0, 430.0, 744.0, 1024.0)) for (rtl in listOf(false, true)) {
            val scale = FocalScrollPerspective.electedScale(false, width)
            val column = FocalScrollPerspective.electedCardFrame(width, rtl).width - 2 * margin
            val pivot = FocalScrollPerspective.electedPivotX(width, rtl)
            val reach = scale * column + margin
            val left = if (rtl) pivot - reach else pivot - margin
            val right = if (rtl) pivot + margin else pivot + reach
            assertWithMessage("w=$width rtl=$rtl gauche").that(left).isAtLeast(inset - 1e-3)
            assertWithMessage("w=$width rtl=$rtl droite").that(right).isAtMost(width - inset + 1e-3)
            assertThat(scale).isAtLeast(1.0)
        }
    }

    @Test
    fun `le cadre epouse la colonne du message et part du bord droit en RTL`() {
        val card = FocalScrollPerspective.electedCardFrame(390.0, isRightToLeft = false)
        assertThat(card.minX).isEqualTo(FocalScrollPerspective.FOCUS_CARD_HORIZONTAL_INSET)
        val column = 390.0 - 2 * FocalMetrics.Row.PADDING_HORIZONTAL -
            FocalMetrics.MetaColumn.RESERVED_WIDTH - FocalMetrics.MetaColumn.SPACING
        assertThat(card.width).isWithin(1e-3).of(column + 2 * FocalScrollPerspective.ELECTED_CARD_MARGIN)
        val mirrored = FocalScrollPerspective.electedCardFrame(390.0, isRightToLeft = true)
        assertThat(mirrored.maxX).isEqualTo(390.0 - FocalScrollPerspective.FOCUS_CARD_HORIZONTAL_INSET)
    }

    @Test
    fun `reduire les animations supprime l agrandissement de l elu`() {
        assertThat(FocalScrollPerspective.electedScale(true, 320.0)).isEqualTo(1.0)
    }

    @Test
    fun `le pivot de la loupe est le bord d attaque de la colonne`() {
        assertThat(FocalScrollPerspective.electedPivotX(390.0, false)).isEqualTo(FocalMetrics.Row.PADDING_HORIZONTAL)
        assertThat(FocalScrollPerspective.electedPivotX(390.0, true)).isEqualTo(390.0 - FocalMetrics.Row.PADDING_HORIZONTAL)
    }

    @Test
    fun `le haut de la bande suit le contenu grossi ou la colonne si elle descend plus bas`() {
        val gap = FocalMetrics.FocusStrip.STRIP_GAP + FocalScrollPerspective.ELECTED_CONTENT_BREATHING
        assertThat(FocalScrollPerspective.electedStripTop(100.0, 10.0, 50.0, 1.2)).isEqualTo(100.0 + gap)
        assertThat(FocalScrollPerspective.electedStripTop(40.0, 10.0, 50.0, 1.2)).isWithin(1e-9).of(70.0 + gap)
        assertThat(FocalScrollPerspective.electedExtraWidth(200.0, 180.0, 1.26)).isWithin(1e-9).of(26.8)
        assertThat(FocalScrollPerspective.electedExtraWidth(300.0, 180.0, 1.26)).isEqualTo(0.0)
    }
}
