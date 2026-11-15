package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le second facteur de la connexion accepte les deux formes du contrat de `POST /auth/login/2fa`
 * (`services/gateway/src/routes/auth/login.ts`, `minLength: 6, maxLength: 9`) : un code TOTP à
 * 6 chiffres, ou un code de secours `XXXX-XXXX` tiré de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
 * (`TwoFactorService.generateBackupCodes`), tiret facultatif.
 */
class TwoFactorCodeFieldTest {

    @Test
    fun sanitize_keepsASixDigitTotpCode() {
        assertThat(TwoFactorCodeField.sanitize("123456")).isEqualTo("123456")
    }

    @Test
    fun sanitize_keepsAPastedBackupCodeInUpperCase() {
        assertThat(TwoFactorCodeField.sanitize("k7mp-q2rx")).isEqualTo("K7MP-Q2RX")
    }

    @Test
    fun sanitize_dropsSpacesAndForeignSymbolsAroundAPastedCode() {
        assertThat(TwoFactorCodeField.sanitize("  K7MP-Q2RX \n")).isEqualTo("K7MP-Q2RX")
        assertThat(TwoFactorCodeField.sanitize("123 456")).isEqualTo("123456")
    }

    @Test
    fun sanitize_capsTheInputAtNineCharacters() {
        assertThat(TwoFactorCodeField.sanitize("K7MP-Q2RXZZZ")).isEqualTo("K7MP-Q2RX")
    }

    @Test
    fun sanitize_stripsNonAsciiLettersAndDigits() {
        assertThat(TwoFactorCodeField.sanitize("１２３456é")).isEqualTo("456")
    }

    @Test
    fun isComplete_acceptsSixAsciiDigits() {
        assertThat(TwoFactorCodeField.isComplete("123456")).isTrue()
    }

    @Test
    fun isComplete_acceptsABackupCodeWithOrWithoutItsHyphen() {
        assertThat(TwoFactorCodeField.isComplete("K7MP-Q2RX")).isTrue()
        assertThat(TwoFactorCodeField.isComplete("K7MPQ2RX")).isTrue()
    }

    @Test
    fun isComplete_refusesAPartialCodeOfEitherForm() {
        assertThat(TwoFactorCodeField.isComplete("12345")).isFalse()
        assertThat(TwoFactorCodeField.isComplete("K7MP-Q2R")).isFalse()
        assertThat(TwoFactorCodeField.isComplete("K7MP-")).isFalse()
        assertThat(TwoFactorCodeField.isComplete("")).isFalse()
    }

    @Test
    fun isComplete_refusesSixCharactersThatAreNotAllDigits() {
        assertThat(TwoFactorCodeField.isComplete("K7MPQ2")).isFalse()
    }

    @Test
    fun isComplete_refusesLettersOutsideTheBackupAlphabet() {
        assertThat(TwoFactorCodeField.isComplete("K7MP-Q2RO")).isFalse()
        assertThat(TwoFactorCodeField.isComplete("K7MP-Q2R1")).isFalse()
        assertThat(TwoFactorCodeField.isComplete("k7mp-q2rx")).isFalse()
    }

    @Test
    fun isComplete_refusesAMisplacedHyphen() {
        assertThat(TwoFactorCodeField.isComplete("K7M-PQ2RX")).isFalse()
        assertThat(TwoFactorCodeField.isComplete("123-456")).isFalse()
    }
}
