package me.meeshy.sdk.model.appearance

/**
 * La composition du fond Signature d'une conversation (miroir de `ConversationBackgroundConfig`, iOS) : quelle
 * animation de base selon le type, quelles surcouches (chiffrement, drapeaux), combien d'avatars en orbite. PURE ;
 * le dessin n'en est qu'une projection, statique au repos.
 */
data class ConversationBackgroundPlan(
    val style: Style,
    val encryption: Encryption,
    val flags: List<String>,
    val avatarCount: Int,
    val hiddenMembers: Int,
) {
    enum class Style { INTIMATE, GROUP, COMMUNITY, GLOBAL }

    enum class Encryption { NONE, SERVER, END_TO_END }

    val showsEncryptionOverlay: Boolean get() = encryption != Encryption.NONE
    val showsMultilingualOverlay: Boolean get() = flags.isNotEmpty()

    companion object {
        const val MULTILINGUAL_THRESHOLD: Int = 3
        private const val WHITE_FLAG = "🏳️"

        private val REGION_OF_LANGUAGE = mapOf(
            "fr" to "FR", "en" to "GB", "es" to "ES", "de" to "DE", "pt" to "PT", "it" to "IT", "zh" to "CN", "ja" to "JP",
            "ko" to "KR", "ar" to "SA", "ru" to "RU", "hi" to "IN", "bn" to "BD", "sw" to "TZ", "tr" to "TR", "vi" to "VN",
            "th" to "TH", "nl" to "NL", "pl" to "PL", "uk" to "UA", "he" to "IL", "el" to "GR", "cs" to "CZ", "ro" to "RO",
            "hu" to "HU", "sv" to "SE", "da" to "DK", "fi" to "FI", "no" to "NO", "id" to "ID", "ms" to "MY", "tl" to "PH",
        )

        fun of(type: String?, encryptionMode: String?, memberCount: Int, topLanguages: List<String>): ConversationBackgroundPlan {
            val avatars = (memberCount / 2).coerceIn(2, 8)
            return ConversationBackgroundPlan(
                style = styleOf(type),
                encryption = when (encryptionMode) {
                    null -> Encryption.NONE
                    "e2ee" -> Encryption.END_TO_END
                    else -> Encryption.SERVER
                },
                flags = if (topLanguages.size >= MULTILINGUAL_THRESHOLD) topLanguages.take(ConversationPrimaryLanguages.LIMIT).map(::flagOf) else emptyList(),
                avatarCount = avatars,
                hiddenMembers = (memberCount - avatars).coerceAtLeast(0),
            )
        }

        private fun styleOf(type: String?): Style = when (type?.lowercase()) {
            "group" -> Style.GROUP
            "community" -> Style.COMMUNITY
            "public", "global", "channel", "broadcast" -> Style.GLOBAL
            else -> Style.INTIMATE
        }

        private fun flagOf(language: String): String {
            val region = REGION_OF_LANGUAGE[language.lowercase()] ?: return WHITE_FLAG
            return region.map { String(Character.toChars(0x1F1E6 + (it - 'A'))) }.joinToString("")
        }
    }
}
