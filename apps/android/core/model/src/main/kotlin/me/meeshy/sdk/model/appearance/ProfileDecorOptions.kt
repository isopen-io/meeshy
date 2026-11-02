package me.meeshy.sdk.model.appearance

import me.meeshy.sdk.model.ProfileDecorRef

/**
 * Ce que le sélecteur de décor PROPOSE : les packs installés ET possédés, rien d'autre (spec § 9) —
 * miroir de `ProfileDecorOptions` (iOS).
 */
object ProfileDecorOptions {

    data class Entry<D>(val ref: ProfileDecorRef, val design: D) {
        /** Unique sur TOUTE la liste à plat. */
        val id: String get() = ref.pack + "/" + ref.item
    }

    data class Group<D>(val pack: String, val items: List<Entry<D>>)

    /** Les groupes mis à plat pour une grille : un identifiant par vignette, unique d'un pack à l'autre. */
    fun <D> flattened(groups: List<Group<D>>): List<Entry<D>> = groups.flatMap { it.items }

    fun rings(installed: List<InstalledPackSummary>?, catalog: AppearanceCatalog): List<Group<AvatarRingDesign>> =
        groups(installed, catalog.ringPacks) { pack -> pack.rings.map { it.key to it } }

    fun banners(installed: List<InstalledPackSummary>?, catalog: AppearanceCatalog): List<Group<AppearanceDesign>> =
        groups(installed, catalog.bannerPacks) { pack -> pack.designs.map { it.key to it } }

    /** Les cadres posés SUR la bannière : aucun pack n'est installé d'office. */
    fun bannerFrames(installed: List<InstalledPackSummary>?, catalog: AppearanceCatalog): List<Group<BannerFrameDesign>> =
        groups(installed, catalog.bannerFramePacks) { pack -> pack.frames.map { it.key to it } }

    /** `installed == null` (liste pas encore lue / ancien serveur) : les packs installés d'office. */
    private fun <P : AppearancePack, D> groups(
        installed: List<InstalledPackSummary>?,
        packs: List<P>,
        designsOf: (P) -> List<Pair<String, D>>,
    ): List<Group<D>> {
        val usable = if (installed == null) {
            packs.filter { it.installedByDefault }
        } else {
            val owned = installed.filter { it.installed && it.isOwned }.map { it.slug }.toSet()
            packs.filter { it.slug in owned }
        }
        return usable.mapNotNull { pack ->
            designsOf(pack).takeIf { it.isNotEmpty() }?.let { designs ->
                Group(pack.slug, designs.map { (key, design) -> Entry(ProfileDecorRef(pack.slug, key), design) })
            }
        }
    }
}
