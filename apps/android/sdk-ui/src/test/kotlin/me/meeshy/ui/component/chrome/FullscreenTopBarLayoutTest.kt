package me.meeshy.ui.component.chrome

import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.fullscreen.FullscreenChromeDimens
import org.junit.Test

class FullscreenTopBarLayoutTest {

    @Test
    fun `le disque visible tombe sur la gouttiere du chrome`() {
        val discLeft = FullscreenTopBarLayout.horizontalPadding +
            (FullscreenChromeDimens.tapTarget - FullscreenChromeDimens.discDiameter) / 2

        assertThat(discLeft).isEqualTo(FullscreenChromeDimens.edgeInset)
    }

    @Test
    fun `la cible deborde le disque vers le bord sans quitter l'ecran`() {
        assertThat(FullscreenTopBarLayout.horizontalPadding).isAtLeast(0.dp)
        assertThat(FullscreenTopBarLayout.horizontalPadding).isLessThan(FullscreenChromeDimens.edgeInset)
    }

    @Test
    fun `la marge haute est celle du chrome`() {
        assertThat(FullscreenTopBarLayout.topPadding).isEqualTo(FullscreenChromeDimens.topInset)
    }

    @Test
    fun `les capsules d'une feuille ont une cible de 48 dp`() {
        assertThat(SheetHeaderLayout.actionMinHeight).isAtLeast(48.dp)
    }
}
