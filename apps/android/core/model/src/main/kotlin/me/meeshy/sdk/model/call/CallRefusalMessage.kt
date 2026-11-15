package me.meeshy.sdk.model.call

/**
 * Le motif d'un refus d'appel que la passerelle nomme par un code typé
 * (`CALL_ERROR_CODES`). Pur : la couche écran traduit le motif en chaîne
 * localisée. `null` pour tout autre code — l'appelant garde son repli.
 */
enum class CallRefusalReason { CALLEE_REFUSES_NON_CONTACTS }

object CallRefusalMessage {
    fun reasonForCode(code: String?): CallRefusalReason? = when (code) {
        "CALLEE_REFUSES_NON_CONTACTS" -> CallRefusalReason.CALLEE_REFUSES_NON_CONTACTS
        else -> null
    }
}
