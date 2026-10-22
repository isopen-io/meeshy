package me.meeshy.sdk.model.net

/** Une capacité NOMMÉE que ce binaire peut déclarer à la passerelle. */
public enum class ClientCapability(public val wire: String) {
    /** L'étape d'onboarding `age` et `viewerWriteRestriction` dans `/me/onboarding`. */
    ONBOARDING_AGE("onboarding-age"),

    /** Le lien de connexion lié à l'appareil. */
    LINK_DEVICE_BINDING("link-device-binding"),
}

/**
 * Ce que ce binaire sait LIRE, déclaré à chaque requête (`X-Meeshy-Capabilities`) —
 * miroir de `ClientCapabilities` (iOS).
 *
 * La production a des utilisateurs : une passerelle plus récente ne sert une forme
 * nouvelle qu'au client qui la DÉCLARE. Déclarer avant de savoir lire échangerait une
 * dégradation lisible contre un écran vide. [declared] ne liste donc que ce dont l'écran
 * est livré : `ONBOARDING_AGE` et `LINK_DEVICE_BINDING` y entrent le jour où leurs écrans
 * existent, jamais avant.
 */
public object ClientCapabilities {
    public const val HEADER_NAME: String = "X-Meeshy-Capabilities"

    public val declared: List<ClientCapability> = emptyList()

    /** La valeur de l'en-tête, ou `null` quand rien n'est déclaré (l'en-tête est alors omis). */
    public fun headerValue(capabilities: List<ClientCapability> = declared): String? =
        capabilities.takeIf { it.isNotEmpty() }?.joinToString(",") { it.wire }
}
