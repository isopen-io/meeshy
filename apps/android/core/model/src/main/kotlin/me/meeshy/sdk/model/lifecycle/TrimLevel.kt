package me.meeshy.sdk.model.lifecycle

/**
 * Niveau de pression memoire ramene a trois paliers, independant de
 * `ComponentCallbacks2` (les constantes sont recopiees pour rester du Kotlin pur).
 * `null` : niveau trop faible pour justifier un delestage (RUNNING_MODERATE, RUNNING_LOW).
 */
enum class TrimLevel {
    UI_HIDDEN,
    RUNNING_CRITICAL,
    COMPLETE,
    ;

    companion object {
        private const val TRIM_MEMORY_RUNNING_CRITICAL = 15
        private const val TRIM_MEMORY_UI_HIDDEN = 20
        private const val TRIM_MEMORY_COMPLETE = 80

        fun fromComponentCallbacks(level: Int): TrimLevel? = when {
            level >= TRIM_MEMORY_COMPLETE -> COMPLETE
            level >= TRIM_MEMORY_UI_HIDDEN -> UI_HIDDEN
            level >= TRIM_MEMORY_RUNNING_CRITICAL -> RUNNING_CRITICAL
            else -> null
        }
    }
}
