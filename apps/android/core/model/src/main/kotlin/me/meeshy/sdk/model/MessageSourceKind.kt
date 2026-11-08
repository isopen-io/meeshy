package me.meeshy.sdk.model

/**
 * D'où vient un message — miroir de `MeeshyMessage.MessageSource` (iOS) et de `messageSource`
 * (packages/shared). Une valeur absente ou inconnue vaut [User] : un tour de parole ordinaire.
 *
 * Le décodage est insensible à la casse, comme `APIMessage.toMessage` (iOS).
 */
public enum class MessageSourceKind {
    User, System, Ads, App, Agent, Authority;

    /** Une notice de la conversation sur elle-même : jamais un tour de parole, donc jamais groupée. */
    public val groupsWithNeighbour: Boolean get() = this != System

    /**
     * Un auteur sans compte propre à engager : tout ce qui n'est pas un utilisateur est porté par
     * la plateforme elle-même (iOS `senderHasAccount = isMe || msgSource != .user`).
     */
    public val impliesAccount: Boolean get() = this != User

    public companion object {
        public fun parse(raw: String?): MessageSourceKind = when (raw?.lowercase()) {
            "system" -> System
            "ads" -> Ads
            "app" -> App
            "agent" -> Agent
            "authority" -> Authority
            else -> User
        }
    }
}

/** La source classée du message ; voir [MessageSourceKind.parse]. */
public val ApiMessage.sourceKind: MessageSourceKind get() = MessageSourceKind.parse(messageSource)
