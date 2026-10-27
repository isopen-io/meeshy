package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSelfTileControlsLawTest {
    private val container = CallTileSize(360f, 740f)
    private val insets = CallSafeInsets(topDp = 24f, bottomDp = 48f, startDp = 0f, endDp = 0f)
    private val tile = CallTileSize(100f, 140f)

    @Test
    fun `une rangee de quatre boutons fait quatre cibles de 44 dp et trois intervalles`() {
        assertThat(CallSelfTileControlsLaw.rowWidth(4)).isEqualTo(4 * 44f + 3 * 4f)
        assertThat(CallSelfTileControlsLaw.rowWidth(0)).isEqualTo(0f)
    }

    @Test
    fun `sans bouton il n'y a pas de rangee`() {
        assertThat(CallSelfTileControlsLaw.frame(CallTilePoint(300f, 130f), tile, container, insets, 0)).isNull()
    }

    @Test
    fun `une vignette en haut recoit sa rangee dessous, centree sur elle`() {
        val frame = requireNotNull(CallSelfTileControlsLaw.frame(CallTilePoint(180f, 130f), tile, container, insets, 3))
        assertThat(frame.yDp).isEqualTo(130f + 70f + 6f)
        assertThat(frame.xDp + frame.widthDp / 2).isEqualTo(180f)
    }

    @Test
    fun `une vignette en bas recoit sa rangee dessus`() {
        val frame = requireNotNull(CallSelfTileControlsLaw.frame(CallTilePoint(180f, 560f), tile, container, insets, 3))
        assertThat(frame.yDp).isEqualTo(560f - 70f - 6f - 44f)
    }

    @Test
    fun `la rangee reste dans la zone sure horizontale quand la vignette est au bord`() {
        val frame = requireNotNull(CallSelfTileControlsLaw.frame(CallTilePoint(66f, 130f), tile, container, insets, 4))
        assertThat(frame.xDp).isAtLeast(6f)
        val right = requireNotNull(CallSelfTileControlsLaw.frame(CallTilePoint(300f, 130f), tile, container, insets, 4))
        assertThat(right.xDp + right.widthDp).isAtMost(360f - 6f)
    }

    @Test
    fun `quand le cote prefere ne tient pas la rangee passe de l'autre cote, jamais sous une barre systeme`() {
        val tight = CallTileSize(360f, 300f)
        val frame = requireNotNull(CallSelfTileControlsLaw.frame(CallTilePoint(180f, 110f), CallTileSize(100f, 140f), tight, insets, 2))
        assertThat(frame.yDp).isAtLeast(insets.topDp)
        assertThat(frame.yDp + frame.heightDp).isAtMost(tight.heightDp - insets.bottomDp)
    }
}
