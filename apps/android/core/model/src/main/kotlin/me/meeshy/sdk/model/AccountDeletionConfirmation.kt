package me.meeshy.sdk.model

/**
 * The typed-phrase confirmation gate for permanent account deletion — feature-parity §L.
 * Port of iOS `DeleteAccountView.requiredPhrase` and its `confirmationText == requiredPhrase`
 * gate.
 *
 * [REQUIRED_PHRASE] is a **server-side literal contract**: the gateway validates the request
 * body against `z.literal('SUPPRIMER MON COMPTE')` (delete-account-schemas.ts), so the phrase
 * must be typed **verbatim** — no trimming, no case-folding. Any leniency that let a near-miss
 * through the client gate would be a guaranteed server `400 INVALID_CONFIRMATION`.
 *
 * Callers send [REQUIRED_PHRASE] on the wire (never the raw typed buffer), so even if the gate
 * were ever loosened the request can never diverge from the server literal.
 */
object AccountDeletionConfirmation {
    /** The exact phrase the user must type — the gateway `z.literal` contract. */
    const val REQUIRED_PHRASE: String = "SUPPRIMER MON COMPTE"

    /** True only when [typed] equals [REQUIRED_PHRASE] exactly (verbatim, case-sensitive). */
    fun isConfirmed(typed: String): Boolean = typed == REQUIRED_PHRASE
}
