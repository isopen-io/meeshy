package me.meeshy.sdk.model.call.montage

/**
 * Ce qu'un classique écrit : un titre (la marque), un sous-titre (la date de la séance) et l'heure,
 * que l'Écran d'une photo seule pose dans sa barre d'état (#12589). Miroir de `CallMontageCaption` (iOS).
 */
public data class CallMontageCaption(val title: String, val subtitle: String, val clock: String? = null) {
    public companion object {
        public const val BRAND_TITLE: String = "Meeshy"
    }
}
