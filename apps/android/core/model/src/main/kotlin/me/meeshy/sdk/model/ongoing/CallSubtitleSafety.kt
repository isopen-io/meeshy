package me.meeshy.sdk.model.ongoing

/**
 * Quand un sous-titre d'appel a le droit de quitter l'écran d'appel vers une surface
 * système (notification « appel en cours »). Miroir de la règle de
 * `CallActivityLaw.servedCaption` (iOS) : un appel chiffré de bout en bout n'en montre
 * aucun tant que la traduction n'est pas faite sur l'appareil, et un chiffrement INCONNU
 * compte comme un chiffrement (fail-closed).
 */
object CallSubtitleSafety {
    const val CAPTION_LIMIT: Int = 140

    /** `isEndToEndEncrypted == null` = conversation non résolue = tenue pour chiffrée. */
    fun maySurface(isEndToEndEncrypted: Boolean?, isTranslatedOnDevice: Boolean): Boolean =
        !(isEndToEndEncrypted ?: true) || isTranslatedOnDevice

    /** Les [CAPTION_LIMIT] derniers caractères, précédés de « … » quand le texte est coupé. */
    fun clipped(text: String): String =
        if (text.length <= CAPTION_LIMIT) text else "…" + text.takeLast(CAPTION_LIMIT - 1)
}
