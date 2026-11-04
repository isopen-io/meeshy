package me.meeshy.sdk.model.settings

/**
 * iOS `SettingsView` : `showLogoutConfirm` puis `isLoggingOut`. La navigation vers la connexion
 * n'a lieu qu'en [Done], donc APRES la fin de la fermeture de session.
 */
enum class LogoutPhase {
    Idle,
    Confirming,
    InProgress,
    Done,
    ;

    /** Pendant la fermeture, l'overlay absorbe tout toucher et les boutons sont désactivés. */
    val blocksInteraction: Boolean get() = this == InProgress

    fun requested(): LogoutPhase = if (this == Idle) Confirming else this

    fun cancelled(): LogoutPhase = if (this == Confirming) Idle else this

    fun confirmed(): LogoutPhase = if (this == Confirming) InProgress else this

    fun finished(): LogoutPhase = if (this == InProgress) Done else this
}
