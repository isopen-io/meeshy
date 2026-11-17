package me.meeshy.sdk.model.net

/** Une capacité NOMMÉE que ce binaire peut déclarer à la passerelle. */
public enum class ClientCapability(public val wire: String) {
    /** L'étape d'onboarding `age` et `viewerWriteRestriction` dans `/me/onboarding`. */
    ONBOARDING_AGE("onboarding-age"),

    /** L'étape d'onboarding `profile` (« Montre-toi », avatar et bannière) dans `/me/onboarding` (#17238). */
    ONBOARDING_PROFILE("onboarding-profile"),

    /** Le lien de connexion lié à l'appareil. */
    LINK_DEVICE_BINDING("link-device-binding"),

    /**
     * #19049 — ce binaire tient les compteurs d'accusés des messages par la socket : la fenêtre de messages se revalide sans
     * eux (ETag faible). Aucun cache HTTP ne resservirait ici le corps d'un 200 sur un 304 (le client API n'en installe
     * pas), et une fenêtre se relit en entier après chaque (re)connexion (`LiveReceiptsContinuity`).
     */
    LIVE_RECEIPTS("live-receipts"),
}

/**
 * Ce que ce binaire sait LIRE, déclaré à chaque requête (`X-Meeshy-Capabilities`) —
 * miroir de `ClientCapabilities` (iOS).
 *
 * La production a des utilisateurs : une passerelle plus récente ne sert une forme
 * nouvelle qu'au client qui la DÉCLARE. Déclarer avant de savoir lire échangerait une
 * dégradation lisible contre un écran vide. [declared] ne liste donc que ce dont l'écran
 * est livré : `ONBOARDING_AGE` et `LINK_DEVICE_BINDING` y entrent le jour où leurs écrans
 * existent, jamais avant. `ONBOARDING_PROFILE` y est : la carte « Montre-toi » est livrée (#17238). `LIVE_RECEIPTS` y est :
 * les accusés voyagent par la socket et la fenêtre se relit en entier après une coupure (#19049).
 */
public object ClientCapabilities {
    public const val HEADER_NAME: String = "X-Meeshy-Capabilities"

    public val declared: List<ClientCapability> = listOf(ClientCapability.ONBOARDING_PROFILE, ClientCapability.LIVE_RECEIPTS)

    /** La valeur de l'en-tête, ou `null` quand rien n'est déclaré (l'en-tête est alors omis). */
    public fun headerValue(capabilities: List<ClientCapability> = declared): String? =
        capabilities.takeIf { it.isNotEmpty() }?.joinToString(",") { it.wire }
}
