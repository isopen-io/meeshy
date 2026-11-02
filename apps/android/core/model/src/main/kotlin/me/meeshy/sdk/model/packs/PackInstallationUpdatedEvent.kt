package me.meeshy.sdk.model.packs

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.InstalledPackSummary

/**
 * `pack:installation-updated` — émis sur `user:<id>` après chaque écriture d'installation, achat compris (miroir de
 * `PackInstallationUpdatedEventData`, packages/shared). `owned` est additif : un ancien serveur l'omet, et la
 * possession déjà connue est alors gardée. La charge suffit à tenir la vitrine et la liste des packs installés.
 */
@Serializable
data class PackInstallationUpdatedEvent(
    val domain: String,
    val slug: String,
    val installed: Boolean = false,
    val owned: Boolean? = null,
    val at: String? = null,
) {
    /** `null` pour un domaine que l'apparence ne porte pas (stickers, cadres de gloire, cadres de capture). */
    val appearanceDomain: AppearancePackDomain? get() = AppearancePackDomain.entries.firstOrNull { it.wire == domain }
}

/** La liste des packs installés d'un domaine avec [event] appliqué : le pack est réécrit en place, ou rejoint la liste. */
fun List<InstalledPackSummary>.applying(event: PackInstallationUpdatedEvent): List<InstalledPackSummary> {
    val known = firstOrNull { it.slug == event.slug }
    val next = (known ?: InstalledPackSummary(event.slug)).copy(installed = event.installed, owned = event.owned ?: known?.owned)
    return if (known == null) this + next else map { if (it.slug == event.slug) next else it }
}

/** La vitrine avec [event] appliqué au pack du domaine ; un pack que la vitrine ne liste pas la laisse intacte. */
fun PackShopResponse.applying(event: PackInstallationUpdatedEvent): PackShopResponse = copy(
    domains = domains.map { section ->
        if (section.domain != event.domain) section
        else section.copy(
            packs = section.packs.map {
                if (it.slug == event.slug) it.copy(installed = event.installed, owned = event.owned ?: it.owned) else it
            },
        )
    },
)
