package me.meeshy.sdk.model.lock

/** Actions de la section « Conversations verrouillées » de Sécurité (parité iOS `conversationLockSection`). */
public enum class LockSectionAction(public val pinMode: LockPinMode) {
    CONFIGURE(LockPinMode.SETUP_MASTER_PIN),
    CHANGE(LockPinMode.CHANGE_MASTER_PIN),
    UNLOCK_ALL(LockPinMode.UNLOCK_ALL),
    REMOVE(LockPinMode.REMOVE_MASTER_PIN),
}

/** Ce que la section affiche : état du code principal, capsule de verrous et actions visibles (dans l'ordre). */
public data class LockSectionPresentation(
    val hasMasterPin: Boolean,
    val lockCount: Int,
    val actions: List<LockSectionAction>,
) {
    /** La capsule « N verrou(s) » n'existe qu'avec un code principal et au moins un verrou. */
    public val showLockBadge: Boolean get() = hasMasterPin && lockCount > 0
}

/**
 * Règle pure de visibilité : sans code, seul Configurer ; avec un code, Modifier, puis « Déverrouiller tout (N) »
 * s'il existe des verrous, sinon Supprimer (jamais les deux : un verrou dépend du code principal).
 */
public fun lockSectionPresentation(hasMasterPin: Boolean, lockCount: Int): LockSectionPresentation {
    val count = lockCount.coerceAtLeast(0)
    val actions = when {
        !hasMasterPin -> listOf(LockSectionAction.CONFIGURE)
        count > 0 -> listOf(LockSectionAction.CHANGE, LockSectionAction.UNLOCK_ALL)
        else -> listOf(LockSectionAction.CHANGE, LockSectionAction.REMOVE)
    }
    return LockSectionPresentation(hasMasterPin, count, actions)
}
