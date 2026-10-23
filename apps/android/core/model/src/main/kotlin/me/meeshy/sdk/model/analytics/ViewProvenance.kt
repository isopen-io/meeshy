package me.meeshy.sdk.model.analytics

/**
 * Ce qui a amené l'écran détail : miroir de `VIEW_PROVENANCES`
 * (`packages/shared/types/content-reach.ts`). Valeur inconnue = absente.
 */
enum class ViewProvenance(val wire: String) {
    LISTING("listing"),
    NOTIFICATION("notification"),
    SHARED_LINK("shared_link"),
    TRACKING_LINK("tracking_link"),
    EXTERNAL("external"),
    DIRECT("direct");

    companion object {
        private val byWire: Map<String, ViewProvenance> = entries.associateBy { it.wire }

        fun fromWire(value: String?): ViewProvenance? = value?.let(byWire::get)
    }
}
