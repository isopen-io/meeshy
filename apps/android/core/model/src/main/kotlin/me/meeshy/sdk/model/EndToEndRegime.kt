package me.meeshy.sdk.model

/**
 * Le régime « chiffré de bout en bout » tel que la passerelle le sert (#13110) :
 * `encryptionMode == "e2ee"` (casse et espaces ignorés), et le littéral que la
 * passerelle persiste dans `content` d'un message e2ee. Site unique pour l'Android
 * natif, qui ne lit ni n'écrit encore l'e2ee (#13015).
 */
object EndToEndRegime {
    const val MODE: String = "e2ee"
    const val CONTENT_PLACEHOLDER: String = "[Encrypted]"

    fun isEndToEnd(encryptionMode: String?): Boolean = encryptionMode?.trim()?.lowercase() == MODE
}
