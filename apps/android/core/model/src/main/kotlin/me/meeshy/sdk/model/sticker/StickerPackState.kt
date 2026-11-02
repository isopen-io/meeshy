package me.meeshy.sdk.model.sticker

/**
 * L'état optimiste de l'installation des packs : instantané -> application locale -> réconciliation
 * ou retour arrière. Pur : la couche réseau appelle [begin], puis [settle] ou [rollback].
 */
data class StickerPackState(
    val installed: Set<String> = emptySet(),
    /** slug -> était-il installé AVANT le geste (ce que le retour arrière restaure). */
    val pending: Map<String, Boolean> = emptyMap(),
    val failedSlug: String? = null,
) {
    fun isInstalled(slug: String): Boolean = slug in installed
    fun isPending(slug: String): Boolean = slug in pending

    /** Bascule le pack tout de suite ; inerte tant qu'un geste est en attente sur ce pack. */
    fun begin(slug: String): StickerPackState {
        if (isPending(slug)) return this
        val was = isInstalled(slug)
        return copy(
            installed = if (was) installed - slug else installed + slug,
            pending = pending + (slug to was),
            failedSlug = null,
        )
    }

    /** Le serveur a confirmé. */
    fun settle(slug: String): StickerPackState = copy(pending = pending - slug)

    /** Le serveur a refusé : l'état d'avant revient et l'échec est signalé. */
    fun rollback(slug: String): StickerPackState {
        val was = pending[slug] ?: return this
        return copy(
            installed = if (was) installed + slug else installed - slug,
            pending = pending - slug,
            failedSlug = slug,
        )
    }

    fun clearFailure(): StickerPackState = copy(failedSlug = null)
}
