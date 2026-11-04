package me.meeshy.sdk.model.comments

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.comments.CommentSheetFit.Detent
import org.junit.Test

class CommentSheetFitTest {
    @Test fun `un composeur sous l'en-tête fait passer la feuille à la grande détente`() {
        assertThat(CommentSheetFit.detent(composerTop = -138f, current = Detent.MEDIUM)).isEqualTo(Detent.LARGE)
    }

    @Test fun `un composeur dans la zone laisse la détente telle quelle`() {
        assertThat(CommentSheetFit.detent(composerTop = 120f, current = Detent.MEDIUM)).isEqualTo(Detent.MEDIUM)
    }

    @Test fun `la tolérance d'arrondi d'un demi-point ne déborde pas`() {
        assertThat(CommentSheetFit.overflows(-0.4f)).isFalse()
        assertThat(CommentSheetFit.overflows(-0.6f)).isTrue()
    }

    @Test fun `la feuille ne se réduit jamais d'elle-même`() {
        assertThat(CommentSheetFit.detent(composerTop = 300f, current = Detent.LARGE)).isEqualTo(Detent.LARGE)
    }

    @Test fun `une mesure non finie ne prouve rien`() {
        assertThat(CommentSheetFit.overflows(Float.NaN)).isFalse()
        assertThat(CommentSheetFit.overflows(Float.NEGATIVE_INFINITY)).isFalse()
    }

    @Test fun `le panneau cède de la hauteur jusqu'au plancher de 96 dp`() {
        assertThat(CommentSheetFit.panelHeightDp(restingDp = 300f, availableDp = 150f, yields = true)).isEqualTo(150f)
        assertThat(CommentSheetFit.panelHeightDp(restingDp = 300f, availableDp = 40f, yields = true)).isEqualTo(96f)
        assertThat(CommentSheetFit.panelHeightDp(restingDp = 300f, availableDp = 500f, yields = true)).isEqualTo(300f)
    }

    @Test fun `sans cession le panneau garde la hauteur du clavier`() {
        assertThat(CommentSheetFit.panelHeightDp(restingDp = 300f, availableDp = 40f, yields = false)).isEqualTo(300f)
    }
}
