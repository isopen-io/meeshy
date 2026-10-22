package me.meeshy.sdk.model.profile

/** Règles de couleur de la fiche ; le hachage lui-même vit dans `DynamicColorGenerator`. */
object ProfileAccentRules {
    /** Couleur neutre d'une fiche bloquée (miroir de `MeeshyColors.blockedNeutralHex`). */
    const val BLOCKED_NEUTRAL_HEX: String = "888888"

    /** La clé qu'on hache : l'id de compte quand il existe, le nom à défaut. */
    fun seed(userId: String?, name: String): String =
        if (userId.isNullOrEmpty()) name else userId

    fun accentHex(isBlockedByTarget: Boolean, profileAccentHex: String): String =
        if (isBlockedByTarget) BLOCKED_NEUTRAL_HEX else profileAccentHex
}
