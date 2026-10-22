package me.meeshy.sdk.model

/**
 * La teinte d'une jauge de force, du rouge au vert. Les deux niveaux extrêmes partagent la
 * leur avec leur voisin (0 et 1 rouges, 4 et 5 verts) : la teinte ne suffit jamais à nommer
 * un niveau, l'étiquette le fait — aucun état n'est porté par la seule couleur.
 */
enum class PasswordStrengthTone {
    DANGER,
    WARNING,
    CAUTION,
    SUCCESS,
}

/**
 * Ce que la jauge de force dessine pour un mot de passe — la projection de
 * [PasswordStrength.evaluate] sur l'écran, port de `PasswordStrengthIndicator` (iOS).
 *
 * Cinq segments pour six niveaux : le niveau 0 n'en remplit aucun, le niveau 5 les remplit
 * tous. L'étiquette ne se montre qu'une fois qu'on a tapé quelque chose — un champ vide ne
 * proclame pas « Trop faible ».
 */
data class PasswordStrengthMeter(
    val level: PasswordStrengthLevel,
    val filledSegments: Int,
    val tone: PasswordStrengthTone,
    val showsLabel: Boolean,
) {
    val totalSegments: Int get() = SEGMENT_COUNT

    companion object {
        const val SEGMENT_COUNT: Int = PasswordStrength.MAX_SCORE

        fun of(password: String): PasswordStrengthMeter {
            val level = PasswordStrength.evaluate(password)
            return PasswordStrengthMeter(
                level = level,
                filledSegments = level.score.coerceAtMost(SEGMENT_COUNT),
                tone = toneOf(level),
                showsLabel = password.isNotEmpty(),
            )
        }

        private fun toneOf(level: PasswordStrengthLevel): PasswordStrengthTone = when (level) {
            PasswordStrengthLevel.TOO_WEAK, PasswordStrengthLevel.WEAK -> PasswordStrengthTone.DANGER
            PasswordStrengthLevel.MEDIUM -> PasswordStrengthTone.WARNING
            PasswordStrengthLevel.GOOD -> PasswordStrengthTone.CAUTION
            PasswordStrengthLevel.STRONG, PasswordStrengthLevel.EXCELLENT -> PasswordStrengthTone.SUCCESS
        }
    }
}
