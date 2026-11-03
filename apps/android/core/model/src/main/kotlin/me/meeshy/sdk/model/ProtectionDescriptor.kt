package me.meeshy.sdk.model

/**
 * Ce qu'un message déclare de sa protection (iOS `MessageProtectionDescriptor`) : éphémère, vue unique, flou,
 * chiffré. Pure : la bulle en lit les puces et la décision de voile, jamais les drapeaux bruts.
 */
public data class ProtectionDescriptor(
    val badges: List<Badge>,
    val isAfterRead: Boolean = false,
) {
    public enum class Badge { Ephemeral, ViewOnce, Blurred, Encrypted }

    /** La puce permanente d'une vue unique : « Touchez pour afficher » ou « Déjà ouvert ». */
    public enum class ViewOnceChip { Sealed, Opened }

    public val isEmpty: Boolean get() = badges.isEmpty()
    public val isViewOnce: Boolean get() = Badge.ViewOnce in badges
    public val isEncrypted: Boolean get() = Badge.Encrypted in badges

    /** Le contenu est voilé jusqu'à un geste : vue unique ou flou. */
    public val requiresVeil: Boolean get() = isViewOnce || Badge.Blurred in badges

    /** Vue unique non ouverte par CE lecteur : la bulle ne porte aucun contenu. */
    public fun sealedForDisplay(openedByMe: Boolean): Boolean = isViewOnce && !openedByMe

    public fun viewOnceChip(openedByMe: Boolean): ViewOnceChip? = when {
        !isViewOnce -> null
        openedByMe -> ViewOnceChip.Opened
        else -> ViewOnceChip.Sealed
    }

    /** Le chrome d'une vue unique qui se dit déjà par sa puce : un état se dit une fois. */
    public val withoutViewOnce: ProtectionDescriptor
        get() = copy(badges = badges.filterNot { it == Badge.ViewOnce })

    public companion object {
        public val Unprotected: ProtectionDescriptor = ProtectionDescriptor(emptyList())

        /**
         * Résout depuis les drapeaux d'effet. Chiffré en échec fermé : tout mode de chiffrement déclaré
         * non vide, hors `plaintext`, protège ; seul le silence ou `plaintext` vaut clair.
         */
        public fun of(effects: MessageEffects, hasExpiry: Boolean, encryptionMode: String?): ProtectionDescriptor {
            val mode = encryptionMode?.trim()?.lowercase().orEmpty()
            val encrypted = mode.isNotEmpty() && mode != "plaintext" && mode != "none"
            val badges = buildList {
                if (hasExpiry || effects.has(MessageEffectFlags.EPHEMERAL)) add(Badge.Ephemeral)
                if (effects.has(MessageEffectFlags.VIEW_ONCE)) add(Badge.ViewOnce)
                if (effects.has(MessageEffectFlags.BLURRED)) add(Badge.Blurred)
                if (encrypted) add(Badge.Encrypted)
            }
            return ProtectionDescriptor(badges, isAfterRead = effects.has(MessageEffectFlags.EPHEMERAL_AFTER_READ))
        }
    }
}
