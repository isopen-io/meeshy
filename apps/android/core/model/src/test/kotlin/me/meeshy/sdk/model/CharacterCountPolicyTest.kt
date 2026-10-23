package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CharacterCountPolicyTest {

    @Test
    fun `le seuil par defaut est 80 pour cent arrondi au superieur`() {
        assertThat(CharacterCountPolicy.resolvedThreshold(limit = 500)).isEqualTo(400)
        assertThat(CharacterCountPolicy.resolvedThreshold(limit = 7)).isEqualTo(6)
    }

    @Test
    fun `un seuil explicite l'emporte`() {
        assertThat(CharacterCountPolicy.resolvedThreshold(limit = 500, warningThreshold = 450)).isEqualTo(450)
    }

    @Test
    fun `l'avertissement commence a 450 sur 500`() {
        assertThat(CharacterCountPolicy.isNearLimit(449, 500, 450)).isFalse()
        assertThat(CharacterCountPolicy.isNearLimit(450, 500, 450)).isTrue()
        assertThat(CharacterCountPolicy.isNearLimit(500, 500, 450)).isTrue()
    }

    @Test
    fun `sans seuil explicite l'avertissement commence a 80 pour cent`() {
        assertThat(CharacterCountPolicy.isNearLimit(399, 500)).isFalse()
        assertThat(CharacterCountPolicy.isNearLimit(400, 500)).isTrue()
    }

    @Test
    fun `le texte d'accessibilite lit N sur M caracteres avec les nombres de la locale`() {
        assertThat(CharacterCountPolicy.accessibilityText(158, 500, "%1\$s sur %2\$s caractères") { it.toString() })
            .isEqualTo("158 sur 500 caractères")
        assertThat(CharacterCountPolicy.accessibilityText(1500, 2000, "%1\$s of %2\$s") { "n$it" })
            .isEqualTo("n1500 of n2000")
    }

    @Test
    fun `le libelle visible est N slash M`() {
        assertThat(CharacterCountPolicy.visibleText(12, 500) { it.toString() }).isEqualTo("12/500")
    }
}
