package me.meeshy.ui.component.chrome

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.view.WindowCompat
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StatusBarIconsOverDarkTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun lightIcons(): Boolean {
        val window = compose.activity.window
        return WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars
    }

    @Test
    fun `l ecran sombre pose des icones claires et la fenetre retrouve son apparence en le quittant`() {
        val window = compose.activity.window
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true
        var shown by mutableStateOf(true)
        compose.setContent { if (shown) StatusBarIconsOverDark() }
        compose.waitForIdle()
        assertThat(lightIcons()).isFalse()

        shown = false
        compose.waitForIdle()
        assertThat(lightIcons()).isTrue()
    }
    @Test
    fun `deux ecrans sombres qui se relaient gardent les icones claires jusqu au depart du dernier`() {
        val window = compose.activity.window
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true
        var first by mutableStateOf(true)
        var second by mutableStateOf(false)
        compose.setContent {
            if (first) StatusBarIconsOverDark()
            if (second) StatusBarIconsOverDark()
        }
        compose.waitForIdle()
        second = true
        compose.waitForIdle()
        first = false
        compose.waitForIdle()
        assertThat(lightIcons()).isFalse()

        second = false
        compose.waitForIdle()
        assertThat(lightIcons()).isTrue()
    }
}
