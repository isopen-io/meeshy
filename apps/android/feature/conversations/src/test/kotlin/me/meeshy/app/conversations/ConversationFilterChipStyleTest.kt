package me.meeshy.app.conversations

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationFilterChipStyleTest {
    private val accent = Color(0xFF3498DB)

    @Test
    fun `selectionnee la puce est pleine couleur, texte blanc et trait epais`() {
        val style = filterChipStyle(accent, isSelected = true, isDark = false)
        assertThat(style.fill).isEqualTo(accent)
        assertThat(style.label).isEqualTo(Color.White)
        assertThat(style.border).isEqualTo(accent)
        assertThat(style.borderWidth).isEqualTo(SELECTED_BORDER)
    }

    @Test
    fun `non selectionnee le fond est teinte 0,3 en clair et 0,4 en sombre, bordure 0,7`() {
        val light = filterChipStyle(accent, isSelected = false, isDark = false)
        val dark = filterChipStyle(accent, isSelected = false, isDark = true)
        assertThat(light.fill).isEqualTo(accent.copy(alpha = 0.3f))
        assertThat(dark.fill).isEqualTo(accent.copy(alpha = 0.4f))
        assertThat(light.border).isEqualTo(accent.copy(alpha = 0.7f))
        assertThat(light.label).isEqualTo(accent)
        assertThat(light.borderWidth).isEqualTo(RESTING_BORDER)
    }
}
