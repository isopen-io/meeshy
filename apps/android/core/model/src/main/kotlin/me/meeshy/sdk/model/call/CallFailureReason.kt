package me.meeshy.sdk.model.call

/**
 * Pourquoi un appel a échoué, dit précisément (iOS `failCall(reason)`). Le motif voyage dans `Ended(Failed)` par son
 * [token] stable ; l'écran le relit par [classify] et le dit dans la langue de l'utilisateur. Un message inconnu
 * (texte brut de la passerelle) retombe sur [Unknown] : le libellé générique, jamais un texte technique.
 */
enum class CallFailureReason(val token: String) {
    InitiateTimedOut("call:initiate timed out"),
    InitiateMalformed("malformed call:initiate ack"),
    ConnectTimedOut("connect timed out"),
    JoinRefused("join refused"),
    MediaSetup("media setup failed"),
    Unknown("failed"),
    ;

    companion object {
        fun classify(message: String?): CallFailureReason {
            val text = message?.trim().orEmpty()
            return entries.firstOrNull { it != Unknown && it.token.equals(text, ignoreCase = true) } ?: Unknown
        }
    }
}
