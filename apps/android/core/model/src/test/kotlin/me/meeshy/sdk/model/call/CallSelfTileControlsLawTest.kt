package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSelfTileControlsLawTest {
    private val container = CallTileSize(360f, 740f)
    private val insets = CallSafeInsets(topDp = 24f, bottomDp = 48f, startDp = 0f, endDp = 0f)
    private val tile = CallTileSize(100f, 140f)
    private val bounds = CallSelfTileControlsLaw.bounds(container, insets)

    @Test
    fun `une rangee de quatre boutons fait quatre cibles de 44 dp et trois intervalles`() {
        assertThat(CallSelfTileControlsLaw.rowWidth(4)).isEqualTo(4 * 44f + 3 * 4f)
        assertThat(CallSelfTileControlsLaw.rowWidth(0)).isEqualTo(0f)
    }

    @Test
    fun `une rangee vit sous l'en-tete et au-dessus de la pilule, jamais sous une barre systeme`() {
        assertThat(bounds.yDp).isEqualTo(24f + CallSelfTileLaw.TOP_CLEARANCE_DP)
        assertThat(bounds.yDp + bounds.heightDp).isEqualTo(740f - 48f - CallSelfTileLaw.BOTTOM_CLEARANCE_DP)
        assertThat(bounds.xDp).isEqualTo(6f)
        assertThat(bounds.xDp + bounds.widthDp).isEqualTo(354f)
    }

    @Test
    fun `sans bouton il n'y a aucune rangee`() {
        val frames = CallSelfTileControlsLaw.rows(CallTilePoint(300f, 204f), tile, bounds, effectsCount = 0, cameraCount = 0)
        assertThat(frames.effects).isNull()
        assertThat(frames.camera).isNull()
    }

    @Test
    fun `effets et ecran au-dessus de la vignette, retourner et camera en dessous, chacune centree sur elle`() {
        val frames = CallSelfTileControlsLaw.rows(CallTilePoint(180f, 300f), tile, bounds, effectsCount = 1, cameraCount = 2)
        val effects = requireNotNull(frames.effects)
        val camera = requireNotNull(frames.camera)
        assertThat(effects.yDp).isEqualTo(300f - 70f - 6f - 44f)
        assertThat(camera.yDp).isEqualTo(300f + 70f + 6f)
        assertThat(effects.xDp + effects.widthDp / 2).isEqualTo(180f)
        assertThat(camera.xDp + camera.widthDp / 2).isEqualTo(180f)
        assertThat(camera.widthDp).isEqualTo(CallSelfTileControlsLaw.rowWidth(2))
    }

    @Test
    fun `sans effet offert seule la rangee de la camera se pose`() {
        val frames = CallSelfTileControlsLaw.rows(CallTilePoint(180f, 300f), tile, bounds, effectsCount = 0, cameraCount = 2)
        assertThat(frames.effects).isNull()
        assertThat(requireNotNull(frames.camera).yDp).isEqualTo(300f + 70f + 6f)
    }

    @Test
    fun `quand le dessus ne tient pas les effets passent dessous, au-dela de la rangee de la camera`() {
        val frames = CallSelfTileControlsLaw.rows(CallTilePoint(180f, 154f), tile, bounds, effectsCount = 1, cameraCount = 2)
        val camera = requireNotNull(frames.camera)
        val effects = requireNotNull(frames.effects)
        assertThat(camera.yDp).isEqualTo(224f + 6f)
        assertThat(effects.yDp).isEqualTo(224f + 6f + 44f + CallSelfTileControlsLaw.ROW_GAP_DP)
    }

    @Test
    fun `quand le dessous ne tient pas la camera passe dessus, au-dela de la rangee des effets`() {
        val frames = CallSelfTileControlsLaw.rows(CallTilePoint(180f, 492f), tile, bounds, effectsCount = 1, cameraCount = 2)
        val effects = requireNotNull(frames.effects)
        val camera = requireNotNull(frames.camera)
        assertThat(effects.yDp).isEqualTo(422f - 6f - 44f)
        assertThat(camera.yDp).isEqualTo(422f - 6f - 44f - CallSelfTileControlsLaw.ROW_GAP_DP - 44f)
    }

    @Test
    fun `quand aucun cote ne tient la rangee reste dans la zone et chevauche le bord du strict necessaire`() {
        val tight = CallSelfTileControlsLaw.bounds(CallTileSize(360f, 420f), insets)
        val frames = CallSelfTileControlsLaw.rows(CallTilePoint(180f, 200f), CallTileSize(100f, 140f), tight, effectsCount = 1, cameraCount = 2)
        listOfNotNull(frames.effects, frames.camera).forEach { row ->
            assertThat(row.yDp).isAtLeast(tight.yDp)
            assertThat(row.yDp + row.heightDp).isAtMost(tight.yDp + tight.heightDp)
        }
    }

    @Test
    fun `la rangee reste dans la zone sure horizontale quand la vignette est au bord`() {
        val left = requireNotNull(CallSelfTileControlsLaw.rows(CallTilePoint(66f, 300f), tile, bounds, 0, 4).camera)
        assertThat(left.xDp).isAtLeast(6f)
        val right = requireNotNull(CallSelfTileControlsLaw.rows(CallTilePoint(300f, 300f), tile, bounds, 0, 4).camera)
        assertThat(right.xDp + right.widthDp).isAtMost(360f - 6f)
    }

    @Test
    fun `au repos la vignette laisse la place d'une rangee sous l'en-tete et d'une autre au-dessus de la pilule`() {
        val top = CallSelfTileControlsLaw.restingCenter(CallTilePoint(300f, 154f), tile, bounds)
        assertThat(top).isEqualTo(CallTilePoint(300f, bounds.yDp + CallSelfTileControlsLaw.ROW_SPAN_DP + 70f))
        val bottom = CallSelfTileControlsLaw.restingCenter(CallTilePoint(300f, 492f), tile, bounds)
        assertThat(bottom).isEqualTo(CallTilePoint(300f, bounds.yDp + bounds.heightDp - CallSelfTileControlsLaw.ROW_SPAN_DP - 70f))
        val rows = CallSelfTileControlsLaw.rows(top, tile, bounds, effectsCount = 1, cameraCount = 2)
        assertThat(requireNotNull(rows.effects).yDp).isEqualTo(bounds.yDp)
    }

    @Test
    fun `un ecran trop court laisse la vignette a son coin`() {
        val tight = CallSelfTileControlsLaw.bounds(CallTileSize(360f, 420f), insets)
        assertThat(CallSelfTileControlsLaw.restingCenter(CallTilePoint(300f, 154f), tile, tight)).isEqualTo(CallTilePoint(300f, 154f))
    }
}
