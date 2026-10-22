package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le liseré d'un champ d'authentification (iOS `AuthTextField`) : indigo à 0,6 au focus,
 * rouge à 0,5 sur une erreur de validation, bord d'entrée à 0,3 au repos. Le focus l'emporte
 * sur l'erreur — on corrige le champ où l'on se trouve.
 */
class AuthFieldBorderTest {

    @Test
    fun `an idle field keeps the soft input border`() {
        val border = AuthFieldBorder.resolve(isFocused = false, hasError = false)

        assertThat(border.role).isEqualTo(AuthFieldBorderRole.INPUT)
        assertThat(border.alpha).isEqualTo(0.3f)
    }

    @Test
    fun `focus switches the border to the brand indigo`() {
        val border = AuthFieldBorder.resolve(isFocused = true, hasError = false)

        assertThat(border.role).isEqualTo(AuthFieldBorderRole.BRAND)
        assertThat(border.alpha).isEqualTo(0.6f)
    }

    @Test
    fun `a validation error reddens an unfocused field`() {
        val border = AuthFieldBorder.resolve(isFocused = false, hasError = true)

        assertThat(border.role).isEqualTo(AuthFieldBorderRole.ERROR)
        assertThat(border.alpha).isEqualTo(0.5f)
    }

    @Test
    fun `focus wins over an error so the field being corrected reads as active`() {
        val border = AuthFieldBorder.resolve(isFocused = true, hasError = true)

        assertThat(border.role).isEqualTo(AuthFieldBorderRole.BRAND)
    }

    @Test
    fun `the leading icon follows the focus`() {
        assertThat(AuthFieldBorder.iconIsBrand(isFocused = true)).isTrue()
        assertThat(AuthFieldBorder.iconIsBrand(isFocused = false)).isFalse()
    }
}
