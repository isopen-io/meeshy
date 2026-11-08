package me.meeshy.sdk.model.pack

/**
 * **L'état de l'étagère d'un domaine, et ses trois transitions PURES** : basculer à l'instant (optimiste), confirmer,
 * revenir en arrière — miroir de `PackShelfState` d'iOS.
 *
 * `installed == null` veut dire « on ne sait pas encore » : l'appelant sert alors les packs intégrés ([served]). Une
 * bascule optimiste ne fabrique PAS une liste à partir de rien : écrire `[chats]` à la place de `null` retirerait Mee, Meo
 * et leurs duos le temps d'un aller-retour.
 */
data class PackShelfState<P : InstallablePack<P>>(
    val installed: List<P>? = null,
    val catalogue: List<P>? = null,
    val pending: Set<String> = emptySet(),
    /** Le dernier geste a été refusé et annulé — la Boutique le dit. */
    val failed: Boolean = false,
) {
    /** L'étagère servie : la liste connue, sinon [defaults] (les packs intégrés). */
    fun served(defaults: List<P>): List<P> = installed ?: defaults

    /**
     * Bascule [pack] À L'INSTANT. `null` si un geste sur ce pack est déjà en vol : deux requêtes contraires se
     * croiseraient, et l'état final serait celui de la plus lente.
     */
    fun togglingInstall(pack: P): PackShelfState<P>? {
        if (pack.slug in pending) return null
        val current = catalogue?.firstOrNull { it.slug == pack.slug } ?: pack
        val nowInstalled = !current.installed
        val flipped = current.withInstall(nowInstalled, (current.installCount + if (nowInstalled) 1 else -1).coerceAtLeast(0))
        return copy(
            catalogue = catalogue?.map { if (it.slug == pack.slug) flipped else it },
            installed = installed?.let { list ->
                when {
                    !nowInstalled -> list.filter { it.slug != pack.slug }
                    list.any { it.slug == pack.slug } -> list
                    else -> list + flipped
                }
            },
            pending = pending + pack.slug,
            failed = false,
        )
    }

    /** La passerelle a confirmé : son `installed` et son compte d'installations font foi. */
    fun settled(slug: String, confirmed: P): PackShelfState<P> = copy(
        pending = pending - slug,
        catalogue = catalogue?.map { if (it.slug == slug) it.withInstall(confirmed.installed, confirmed.installCount) else it },
    )

    /** **Retour en arrière du SEUL pack refusé** : un autre geste en vol reste ce qu'il est. */
    fun rolledBack(slug: String, previous: PackShelfState<P>): PackShelfState<P> {
        val before = previous.catalogue?.firstOrNull { it.slug == slug }
        val wasInstalled = previous.installed?.firstOrNull { it.slug == slug }
        return copy(
            pending = pending - slug,
            failed = true,
            catalogue = if (before == null) catalogue else catalogue?.map { if (it.slug == slug) before else it },
            installed = installed?.let { list -> list.filter { it.slug != slug } + listOfNotNull(wasInstalled) },
        )
    }

    /** Un pack lu à nouveau (achat confirmé, relecture) remplace le sien partout où il figure, sans toucher aux gestes en vol. */
    fun replacing(pack: P): PackShelfState<P> = copy(
        catalogue = catalogue?.map { if (it.slug == pack.slug) pack else it },
        installed = installed?.map { if (it.slug == pack.slug) pack else it },
    )

    fun clearFailure(): PackShelfState<P> = if (failed) copy(failed = false) else this
}
