package me.meeshy.sdk.model.settings

/**
 * Les invites de réglage du produit (#16339) : un message ou un bandeau qui propose d'activer un réglage. Chacune mène
 * au hub Réglages, qui fait défiler jusqu'à la [section] du réglage et la met en évidence. Site UNIQUE de la
 * correspondance invite → réglage : une nouvelle invite s'ajoute ici, jamais dans l'écran qui la porte.
 */
public enum class SettingsInvite(public val wire: String, public val section: SettingsHubSectionId) {
    /** « Activez le consentement vocal… » : le consentement se donne en créant son profil vocal. */
    VOICE_CONSENT("voice-consent", SettingsHubSectionId.VOICE),

    /** « Définissez un code maître… » : le verrouillage vit dans Sécurité, rangée de la section Compte. */
    MASTER_PIN("master-pin", SettingsHubSectionId.ACCOUNT),
    ;

    public companion object {
        public fun fromWire(wire: String?): SettingsInvite? = entries.firstOrNull { it.wire == wire }
    }
}
