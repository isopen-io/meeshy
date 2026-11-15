package me.meeshy.sdk.model.auth

/**
 * Les états du bouton d'action d'authentification — « Se connecter », « Recevoir le lien »,
 * « Enregistrer le mot de passe » (iOS `AuthActionButton` + `LoginView.loginButton`).
 *
 * - Bloqué par son hôte (formulaire incomplet) : il SE VOIT bloqué — opacité 0,6 — et ignore
 *   le toucher.
 * - Envoi en cours : il garde sa couleur de marque, l'action est LANCÉE, pas refusée ; un
 *   indicateur remplace le libellé (que le lecteur d'écran continue de lire) et le toucher
 *   est ignoré, pour qu'un envoi ne parte pas deux fois.
 */
data class AuthActionButtonState(
    val acceptsTaps: Boolean,
    val showsSpinner: Boolean,
    val restingAlpha: Float,
) {
    companion object {
        const val DISABLED_ALPHA: Float = 0.6f

        fun resolve(enabled: Boolean, loading: Boolean): AuthActionButtonState = AuthActionButtonState(
            acceptsTaps = enabled && !loading,
            showsSpinner = loading,
            restingAlpha = if (enabled) 1f else DISABLED_ALPHA,
        )
    }
}
