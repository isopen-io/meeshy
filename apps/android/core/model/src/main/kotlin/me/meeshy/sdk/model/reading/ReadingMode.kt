package me.meeshy.sdk.model.reading

/**
 * Le mode de lecture RÉELLEMENT rendu pour une conversation — miroir de
 * `ConversationReadingMode` (`packages/shared/types/reading-modes.ts`) et de
 * `ReadingModeOrchestrator.ConversationReadingMode` (iOS). [wire] est la valeur persistée et
 * échangée avec la passerelle.
 */
enum class ConversationReadingMode(val wire: String) {
    FOCAL("focal"),
    SCRIPT("script"),
    SUMMARY("summary"),
    RIVER("river"),
    BUBBLES("bubbles"),
    ;

    companion object {
        /** `null` pour une valeur inconnue ou absente : un mode futur ne casse pas la lecture. */
        fun fromWire(value: String?): ConversationReadingMode? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * Ce que l'utilisateur a CHOISI (les mots du menu) — miroir de `ReadingModePreference`.
 * [AUTO] rend la main aux branches numériques de l'orchestrateur et n'a aucune image stockée.
 */
enum class ReadingModePreference(val wire: String) {
    AUTO("auto"),
    FOCAL("focal"),
    SCRIPT("script"),
    RESUME("resume"),
    RIVIERE("riviere"),
    BULLES("bulles"),
    ;

    companion object {
        fun fromWire(value: String?): ReadingModePreference? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * Traduction mode RENDU ⇄ préférence (les mots du menu), UNE copie — miroir de
 * `ReadingModePreferenceMapping` (iOS). L'aller-retour est TOTAL : `bubbles` ⇄ `bulles` ne
 * dégrade jamais un choix venu du canal serveur en `auto`.
 */
object ReadingModePreferenceMapping {
    fun preference(mode: ConversationReadingMode?): ReadingModePreference = when (mode) {
        null -> ReadingModePreference.AUTO
        ConversationReadingMode.FOCAL -> ReadingModePreference.FOCAL
        ConversationReadingMode.SCRIPT -> ReadingModePreference.SCRIPT
        ConversationReadingMode.SUMMARY -> ReadingModePreference.RESUME
        ConversationReadingMode.RIVER -> ReadingModePreference.RIVIERE
        ConversationReadingMode.BUBBLES -> ReadingModePreference.BULLES
    }

    /** `AUTO` ⇒ `null` : « revenir en mode auto » EFFACE la clé, jamais un marqueur écrit en dur. */
    fun storedMode(preference: ReadingModePreference): ConversationReadingMode? = when (preference) {
        ReadingModePreference.AUTO -> null
        ReadingModePreference.FOCAL -> ConversationReadingMode.FOCAL
        ReadingModePreference.SCRIPT -> ConversationReadingMode.SCRIPT
        ReadingModePreference.RESUME -> ConversationReadingMode.SUMMARY
        ReadingModePreference.RIVIERE -> ConversationReadingMode.RIVER
        ReadingModePreference.BULLES -> ConversationReadingMode.BUBBLES
    }
}

/**
 * Le type de conversation tel que les lois de lecture le connaissent : cinq valeurs. `community`,
 * `channel`, `bot` et toute valeur inconnue sont repliés sur [GROUP] — aucun n'est jamais
 * `direct`, donc aucun n'entrave l'éligibilité de la Rivière (miroir de `orchestratorType`).
 */
enum class ReadingConversationType {
    DIRECT,
    GROUP,
    PUBLIC,
    GLOBAL,
    BROADCAST,
    ;

    companion object {
        fun fromWire(type: String?): ReadingConversationType = when (type?.lowercase()) {
            "direct" -> DIRECT
            "public" -> PUBLIC
            "global" -> GLOBAL
            "broadcast" -> BROADCAST
            else -> GROUP
        }
    }
}

/** Mode de chiffrement d'une conversation (`packages/shared/types/encryption.ts`), `null` hors ces trois valeurs. */
enum class ReadingEncryptionMode(val wire: String) {
    E2EE("e2ee"),
    SERVER("server"),
    HYBRID("hybrid"),
    ;

    companion object {
        fun fromWire(value: String?): ReadingEncryptionMode? = entries.firstOrNull { it.wire == value }
    }
}
