package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [AccountDeletionConfirmation] — the typed-phrase gate SSOT for
 * permanent account deletion (feature-parity §L, port of iOS `DeleteAccountView`). The
 * match is verbatim because [AccountDeletionConfirmation.REQUIRED_PHRASE] is the gateway
 * `z.literal('SUPPRIMER MON COMPTE')` contract (delete-account-schemas.ts): any trim or
 * case-fold that let a near-miss through the client gate would be a guaranteed server 400.
 */
class AccountDeletionConfirmationTest {

    @Test
    fun isConfirmed_exactPhrase_isTrue() {
        assertThat(AccountDeletionConfirmation.isConfirmed("SUPPRIMER MON COMPTE")).isTrue()
    }

    @Test
    fun isConfirmed_empty_isFalse() {
        assertThat(AccountDeletionConfirmation.isConfirmed("")).isFalse()
    }

    @Test
    fun isConfirmed_differentPhrase_isFalse() {
        assertThat(AccountDeletionConfirmation.isConfirmed("delete my account")).isFalse()
    }

    @Test
    fun isConfirmed_lowercase_isFalse() {
        // The gateway literal is case-sensitive — a lowercased phrase must not pass.
        assertThat(AccountDeletionConfirmation.isConfirmed("supprimer mon compte")).isFalse()
    }

    @Test
    fun isConfirmed_leadingWhitespace_isFalse() {
        // No trim: a padded phrase would clear the client gate but the server literal rejects it.
        assertThat(AccountDeletionConfirmation.isConfirmed(" SUPPRIMER MON COMPTE")).isFalse()
    }

    @Test
    fun isConfirmed_trailingWhitespace_isFalse() {
        assertThat(AccountDeletionConfirmation.isConfirmed("SUPPRIMER MON COMPTE ")).isFalse()
    }

    @Test
    fun isConfirmed_partialPrefix_isFalse() {
        assertThat(AccountDeletionConfirmation.isConfirmed("SUPPRIMER MON")).isFalse()
    }

    @Test
    fun requiredPhrase_matchesGatewayLiteral() {
        // Pins the cross-platform wire contract: the gateway `z.literal('SUPPRIMER MON COMPTE')`
        // in delete-account-schemas.ts. A drift here silently breaks every Android deletion.
        assertThat(AccountDeletionConfirmation.REQUIRED_PHRASE).isEqualTo("SUPPRIMER MON COMPTE")
    }
}
