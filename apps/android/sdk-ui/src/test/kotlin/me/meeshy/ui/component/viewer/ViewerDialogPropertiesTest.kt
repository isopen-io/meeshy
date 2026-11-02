package me.meeshy.ui.component.viewer

import androidx.compose.ui.window.SecureFlagPolicy
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ViewerDialogPropertiesTest {

    @Test
    fun `un contenu protege ouvre une fenetre securisee`() {
        assertThat(viewerDialogProperties(secure = true).securePolicy).isEqualTo(SecureFlagPolicy.SecureOn)
    }

    @Test
    fun `un contenu ordinaire garde le comportement herite`() {
        assertThat(viewerDialogProperties(secure = false).securePolicy).isEqualTo(SecureFlagPolicy.Inherit)
    }

    @Test
    fun `la visionneuse reste plein ecran`() {
        val properties = viewerDialogProperties(secure = true)
        assertThat(properties.usePlatformDefaultWidth).isFalse()
        assertThat(properties.decorFitsSystemWindows).isFalse()
    }
}
