package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [TwoFactorCode] — mirrors the gateway's zod schemas
 * (`services/gateway/src/validation/two-factor-schemas.ts`): `enable`/`backup-codes`
 * require an exact 6-digit TOTP; `disable` accepts either a live TOTP or an 8-char
 * alphanumeric backup code (6-8 chars). Kept as a local pre-flight gate so the submit
 * button can stay disabled on an obviously malformed code without a round trip.
 */
class TwoFactorCodeTest {

    @Test
    fun isValidTotp_sixDigits_isValid() {
        assertThat(TwoFactorCode.isValidTotp("123456")).isTrue()
    }

    @Test
    fun isValidTotp_empty_isInvalid() {
        assertThat(TwoFactorCode.isValidTotp("")).isFalse()
    }

    @Test
    fun isValidTotp_fiveDigits_isInvalid() {
        assertThat(TwoFactorCode.isValidTotp("12345")).isFalse()
    }

    @Test
    fun isValidTotp_sevenDigits_isInvalid() {
        assertThat(TwoFactorCode.isValidTotp("1234567")).isFalse()
    }

    @Test
    fun isValidTotp_sixCharsWithLetter_isInvalid() {
        assertThat(TwoFactorCode.isValidTotp("12345a")).isFalse()
    }

    @Test
    fun isValidTotp_sixDigitsWithWhitespace_isInvalid() {
        assertThat(TwoFactorCode.isValidTotp(" 12345")).isFalse()
    }

    @Test
    fun isValidDisableCode_sixDigitTotp_isValid() {
        assertThat(TwoFactorCode.isValidDisableCode("123456")).isTrue()
    }

    @Test
    fun isValidDisableCode_eightCharBackupCode_isValid() {
        assertThat(TwoFactorCode.isValidDisableCode("A1B2C3D4")).isTrue()
    }

    @Test
    fun isValidDisableCode_sevenChars_isValid() {
        assertThat(TwoFactorCode.isValidDisableCode("A1B2C3D")).isTrue()
    }

    @Test
    fun isValidDisableCode_fiveChars_isInvalid() {
        assertThat(TwoFactorCode.isValidDisableCode("A1B2C")).isFalse()
    }

    @Test
    fun isValidDisableCode_nineChars_isInvalid() {
        assertThat(TwoFactorCode.isValidDisableCode("A1B2C3D4E")).isFalse()
    }

    @Test
    fun isValidDisableCode_empty_isInvalid() {
        assertThat(TwoFactorCode.isValidDisableCode("")).isFalse()
    }

    @Test
    fun isValidDisableCode_containsSymbol_isInvalid() {
        assertThat(TwoFactorCode.isValidDisableCode("A1B2-3D4")).isFalse()
    }
}
