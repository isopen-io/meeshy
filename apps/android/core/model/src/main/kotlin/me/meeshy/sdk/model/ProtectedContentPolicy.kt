package me.meeshy.sdk.model

/** Les protections qu'un contenu déclare. */
public data class ContentProtection(
    val isEphemeral: Boolean = false,
    val isViewOnce: Boolean = false,
    val isBlurred: Boolean = false,
    val isEncrypted: Boolean = false,
)

/**
 * Un contenu protégé (éphémère, vue unique, flouté, chiffré) voile la fenêtre qui l'affiche : aperçu des récents
 * masqué, capture d'écran rapportée au pair. Un seul prédicat, pour que le voile et le rapport ne divergent pas.
 */
public object ProtectedContentPolicy {
    public fun requiresVeil(protection: ContentProtection): Boolean =
        protection.isEphemeral || protection.isViewOnce || protection.isBlurred || protection.isEncrypted
}
