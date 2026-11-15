package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K15 — témoin rouge : la feuille ancrée garde 120 dp au-dessus d'elle (fiche K15 §2). */
class MeeshyAnchoredSheetTest {

    @Test
    fun `la feuille garde 120 au-dessus d'elle`() {
        assertThat(MeeshyAnchoredSheetMetrics.RESERVED_ABOVE).isEqualTo(120f)
    }
}
