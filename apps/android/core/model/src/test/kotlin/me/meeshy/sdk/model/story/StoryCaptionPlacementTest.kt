package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCaptionPlacementTest {
    @Test
    fun `la legende epouse la hauteur mesuree du composeur`() {
        assertThat(StoryCaptionPlacement.bottomInset(composerBlockHeight = 120f, composerBottomPadding = 10f, isComposerShown = true))
            .isEqualTo(130f)
    }

    @Test
    fun `sans composeur la legende est au ras du bas`() {
        assertThat(StoryCaptionPlacement.bottomInset(null, 10f, true)).isEqualTo(10f)
        assertThat(StoryCaptionPlacement.bottomInset(0f, 10f, true)).isEqualTo(10f)
    }

    @Test
    fun `chrome masque ne reserve rien`() {
        assertThat(StoryCaptionPlacement.bottomInset(120f, 10f, false)).isEqualTo(10f)
    }

    @Test
    fun `la bande du rail se rend au repere de l'ecran`() {
        assertThat(StoryCaptionPlacement.railClearanceInset(columnWidth = 400f, viewportWidth = 400f)).isEqualTo(68f)
        assertThat(StoryCaptionPlacement.railClearanceInset(columnWidth = 490f, viewportWidth = 400f)).isEqualTo(113f)
        assertThat(StoryCaptionPlacement.railClearanceInset(columnWidth = 300f, viewportWidth = 400f)).isEqualTo(68f)
    }

    @Test
    fun `la scene s'efface a 0,28 quand la legende est depliee`() {
        assertThat(StoryCaptionPlacement.sceneOpacity(captionExpanded = true)).isEqualTo(0.28f)
        assertThat(StoryCaptionPlacement.sceneOpacity(captionExpanded = false)).isEqualTo(1f)
    }

    @Test
    fun `le haut du chrome reserve la barre d'etat plus 100`() {
        assertThat(StoryCaptionPlacement.topChromeReserve(44f)).isEqualTo(144f)
    }

    @Test
    fun `le ressort est 0,38 sur 0,82 et la retrait lateral 20`() {
        assertThat(StoryCaptionPlacement.SPRING_RESPONSE).isEqualTo(0.38f)
        assertThat(StoryCaptionPlacement.SPRING_DAMPING).isEqualTo(0.82f)
        assertThat(StoryCaptionPlacement.SIDE_INSET_DP).isEqualTo(20f)
        assertThat(StoryCaptionPlacement.springStiffness()).isWithin(0.5f).of(273.3f)
    }

    @Test
    fun `la legende commence au-dessus du composeur deplie puis de la bulle repliee`() {
        val expanded = StoryCaptionPlacement.bottomInset(composerBlockHeight = 120f, composerBottomPadding = 10f, isComposerShown = true)
        val folded = StoryCaptionPlacement.bottomInset(composerBlockHeight = 48f, composerBottomPadding = 10f, isComposerShown = true)
        assertThat(expanded).isEqualTo(130f)
        assertThat(folded).isEqualTo(58f)
    }

    @Test
    fun `chrome masque le composeur sort et la legende redescend`() {
        assertThat(StoryCaptionPlacement.bottomInset(composerBlockHeight = 120f, composerBottomPadding = 10f, isComposerShown = false)).isEqualTo(10f)
    }
}
