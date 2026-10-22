package me.meeshy.sdk.model.auth

/** Quel jeton colore le liseré : la couleur de marque, l'erreur, ou le bord d'entrée du thème. */
enum class AuthFieldBorderRole {
    BRAND,
    ERROR,
    INPUT,
}

/**
 * Le liseré d'un champ d'authentification (iOS `AuthTextField`). Le NOM du jeton et son
 * opacité sont décidés ici, prouvés sans écran ; la couleur elle-même vient du thème, claire
 * ou sombre.
 *
 * Le focus l'emporte sur l'erreur : le champ que l'on est en train de corriger se lit actif.
 */
data class AuthFieldBorder(val role: AuthFieldBorderRole, val alpha: Float) {
    companion object {
        const val FOCUSED_ALPHA: Float = 0.6f
        const val ERROR_ALPHA: Float = 0.5f
        const val IDLE_ALPHA: Float = 0.3f

        fun resolve(isFocused: Boolean, hasError: Boolean): AuthFieldBorder = when {
            isFocused -> AuthFieldBorder(AuthFieldBorderRole.BRAND, FOCUSED_ALPHA)
            hasError -> AuthFieldBorder(AuthFieldBorderRole.ERROR, ERROR_ALPHA)
            else -> AuthFieldBorder(AuthFieldBorderRole.INPUT, IDLE_ALPHA)
        }

        /** L'icône de tête prend la teinte de marque tant que le champ a le focus. */
        fun iconIsBrand(isFocused: Boolean): Boolean = isFocused
    }
}
