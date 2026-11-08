package me.meeshy.ui.component.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.icons.MeeshyIcons
import org.junit.Test

/**
 * #16334 — la baguette ne désigne plus la composition : « Créer avec ce média » prend l'icône du POST
 * (iOS `square.and.pencil`) et la baguette devient « Imager » sur les rails d'actions.
 */
class FullscreenChromeWandTest {

    @Test
    fun `creer avec ce media porte l'icone du post, plus la baguette`() {
        assertThat(FullscreenChromeSymbol.Compose.icon).isEqualTo(MeeshyIcons.ComposeNew)
        assertThat(FullscreenChromeSymbol.Compose.icon).isNotEqualTo(MeeshyIcons.MagicWand)
    }

    @Test
    fun `imager porte la baguette sur les rails`() {
        assertThat(FullscreenChromeSymbol.Imager.icon).isEqualTo(MeeshyIcons.MagicWand)
    }
}
