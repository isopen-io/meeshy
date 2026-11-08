package me.meeshy.ui.appearance

import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.model.appearance.AppearancePackDomain

/**
 * L'ouvreur de la boutique de packs (le « Plus dans la boutique » d'iOS) : une surface qui propose des packs, comme le
 * sélecteur de fond d'une conversation, le tend vers la vitrine du [domain] sans dépendre de `:feature:settings`.
 * La destination est posée par `:app` autour de l'écran hôte ([LocalPackShopOpener]).
 */
public fun interface PackShopOpener {
    public fun open(domain: AppearancePackDomain)
}

/** Sans hôte (aperçus, tests, arbre hors racine) : aucun lien n'est posé, la surface ne montre pas de porte morte. */
public val LocalPackShopOpener: ProvidableCompositionLocal<PackShopOpener?> =
    staticCompositionLocalOf { null }
