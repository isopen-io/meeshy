package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13666 — les icônes de la barre d'état suivent le thème CHOISI dans l'app, pas seulement celui du système. */
class SystemBarsAppearanceTest {

    @Test
    fun `un theme clair choisi sur un systeme sombre garde des icones sombres`() {
        val appearance = SystemBarsAppearance.of(AppThemeMode.LIGHT, systemInDark = true)
        assertThat(appearance.darkTheme).isFalse()
        assertThat(appearance.darkIcons).isTrue()
    }

    @Test
    fun `un theme sombre choisi sur un systeme clair garde des icones claires`() {
        val appearance = SystemBarsAppearance.of(AppThemeMode.DARK, systemInDark = false)
        assertThat(appearance.darkTheme).isTrue()
        assertThat(appearance.darkIcons).isFalse()
    }

    @Test
    fun `le theme systeme suit le systeme dans les deux sens`() {
        assertThat(SystemBarsAppearance.of(AppThemeMode.AUTO, systemInDark = true).darkIcons).isFalse()
        assertThat(SystemBarsAppearance.of(AppThemeMode.AUTO, systemInDark = false).darkIcons).isTrue()
    }

    @Test
    fun `les icones sont toujours le contraire du fond de l application`() {
        AppThemeMode.entries.forEach { mode ->
            listOf(true, false).forEach { system ->
                val appearance = SystemBarsAppearance.of(mode, system)
                assertThat(appearance.darkIcons).isEqualTo(!mode.resolveDarkMode(system))
            }
        }
    }
}
