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

/**
 * #13106 — une pièce chiffrée sur l'appareil de l'expéditeur (#10789) : un blob opaque que
 * l'Android natif ne sait pas ouvrir (#13015). Elle ne se rend ni en fichier, ni en image,
 * ni en audio, et rien ne la télécharge.
 */
val ApiMessageAttachment.isEndToEndBlob: Boolean
    get() = EndToEndRegime.isEndToEnd(encryptionMode)
