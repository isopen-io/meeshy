package me.meeshy.sdk.model

/**
 * Ce que la cloche MONTRE sous une catégorie — miroir de `NotificationListViewModel` (iOS) où
 * chaque catégorie a sa propre liste servie par la passerelle ([NotificationFilterCategory.serverQuery]).
 *
 * [ALL] se lit dans le cache de la cloche (la liste partagée, temps réel compris). Une autre
 * catégorie ajoute les lignes que le serveur a rendues pour ELLE ([fetched]) à celles du cache
 * qu'elle accepte : le cache gagne quand les deux portent la même id (c'est lui que le socket et
 * les gestes optimistes modifient), et la loi `accepts` rejoue celle de la passerelle sur tout ce
 * qui a changé depuis. Ordre : le plus récent d'abord.
 */
public object NotificationCategoryFeed {

    public fun visible(
        category: NotificationFilterCategory,
        cache: List<ApiNotification>,
        fetched: List<ApiNotification>,
    ): List<ApiNotification> {
        val fromCache = cache.filter(category::accepts)
        if (category == NotificationFilterCategory.ALL || fetched.isEmpty()) return fromCache
        val cacheIds = cache.mapTo(HashSet(cache.size)) { it.id }
        val extra = fetched.filter { it.id !in cacheIds && category.accepts(it) }
        if (extra.isEmpty()) return fromCache
        return (fromCache + extra).sortedByDescending { it.state.createdAt }
    }

    /** Les lignes servies pour une catégorie, privées de celles qui ont quitté le cache depuis. */
    public fun withoutRemoved(
        fetched: List<ApiNotification>,
        previousCache: List<ApiNotification>,
        cache: List<ApiNotification>,
    ): List<ApiNotification> {
        if (fetched.isEmpty() || previousCache.isEmpty()) return fetched
        val now = cache.mapTo(HashSet(cache.size)) { it.id }
        val gone = previousCache.mapNotNullTo(HashSet()) { it.id.takeIf { id -> id !in now } }
        if (gone.isEmpty()) return fetched
        return fetched.filterNot { it.id in gone }
    }
}
