package me.meeshy.sdk.model

/**
 * Le nom qu'on montre pour une frappe (`typing:start`), miroir de `TypingEvent.preferredDisplayName`
 * (iOS) : le gateway transmet les deux valeurs brutes, le client choisit.
 */
public object TypingNames {

    /** Dans la conversation : `displayName` sinon `username` sinon l'identifiant. */
    public fun inConversation(event: TypingEvent): String =
        event.displayName?.takeIf { it.isNotBlank() }
            ?: event.username?.takeIf { it.isNotBlank() }
            ?: event.userId

    /** Hors conversation (pastille de liste) : le nom d'affichage, sinon `@username`. */
    public fun onPill(event: TypingEvent): String =
        event.displayName?.takeIf { it.isNotBlank() }
            ?: event.username?.takeIf { it.isNotBlank() }?.let { "@$it" }
            ?: event.userId
}
