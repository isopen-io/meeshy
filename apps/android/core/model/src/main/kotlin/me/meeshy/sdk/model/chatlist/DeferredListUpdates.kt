package me.meeshy.sdk.model.chatlist

/**
 * Les mises à jour de la liste que rien ne doit appliquer PENDANT un geste ni pendant que la
 * liste dort sous un panneau opaque (iOS `hasDeferredGlobalReconfigure` +
 * `deferredReconfigureScope` + `deferredTargetedReconfigureIds`, §4.7ter).
 *
 * Tant que le défilement dure ou que la liste dort, [offer] garde l'UNION des identifiants
 * touchés (`null` = reconfiguration globale, qui domine toujours) ; la fin du geste ou le réveil
 * rend cette union UNE fois. Le défilement se déclare terminé à l'arrêt effectif de l'élan,
 * jamais à la levée du doigt.
 */
class DeferredListUpdates {

    /** Ce qu'il faut rejouer : `everything` = toute la liste, sinon seulement [ids]. */
    data class Release(val ids: Set<String>, val everything: Boolean)

    var isScrolling: Boolean = false
        private set
    var isAsleep: Boolean = false
        private set

    private var pendingIds: Set<String> = emptySet()
    private var pendingAll: Boolean = false
    private var hasPending: Boolean = false

    val isHeld: Boolean get() = isScrolling || isAsleep

    /** Une mise à jour arrive : rendue telle quelle si la liste est libre, sinon mémorisée. */
    fun offer(ids: Set<String>?): Release? {
        if (!isHeld) return Release(ids ?: emptySet(), everything = ids == null)
        hasPending = true
        if (ids == null) pendingAll = true else pendingIds = pendingIds + ids
        return null
    }

    fun setScrolling(scrolling: Boolean): Release? {
        isScrolling = scrolling
        return drainIfFree()
    }

    fun setAsleep(asleep: Boolean): Release? {
        isAsleep = asleep
        return drainIfFree()
    }

    /** Oublie ce qui attend : l'appelant vient d'appliquer l'état le plus récent. */
    fun clear() {
        pendingIds = emptySet()
        pendingAll = false
        hasPending = false
    }

    private fun drainIfFree(): Release? {
        if (isHeld || !hasPending) return null
        val release = Release(if (pendingAll) emptySet() else pendingIds, everything = pendingAll)
        clear()
        return release
    }
}
