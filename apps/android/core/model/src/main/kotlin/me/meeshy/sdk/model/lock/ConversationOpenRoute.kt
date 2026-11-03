package me.meeshy.sdk.model.lock

/**
 * Ce que devient une demande d'ouverture de conversation — miroir de iOS `ConversationOpenRoute`.
 *
 * La recherche demandee sur une conversation verrouillee attend le code : armee avant, elle
 * survivrait a un code abandonne et s'ouvrirait dans la prochaine conversation venue.
 */
public sealed interface ConversationOpenRoute {
    public val searching: Boolean

    /** Ouvre tout de suite ; la recherche demandee est armee a l'ouverture. */
    public data class Open(override val searching: Boolean) : ConversationOpenRoute

    /** Demande le code d'abord ; la recherche n'est conservee qu'apres un code accepte. */
    public data class UnlockFirst(override val searching: Boolean) : ConversationOpenRoute

    /** La feuille de code s'affiche avant tout contenu. */
    public val presentsLockSheet: Boolean get() = this is UnlockFirst

    /** La recherche s'arme a l'ouverture, sans attendre de code. */
    public val armsSearchNow: Boolean get() = this is Open && searching

    /** La recherche ne s'arme qu'une fois le code accepte. */
    public val searchesAfterUnlock: Boolean get() = this is UnlockFirst && searching

    public companion object {
        public fun resolve(isLocked: Boolean, searching: Boolean): ConversationOpenRoute =
            if (isLocked) UnlockFirst(searching) else Open(searching)

        /** Une fenetre detachee ou la fiche de details ne s'offrent qu'a une conversation non gardee. */
        public fun mayDetach(isLocked: Boolean): Boolean = !isLocked

        public fun mayShowInfo(isLocked: Boolean): Boolean = !isLocked
    }
}
