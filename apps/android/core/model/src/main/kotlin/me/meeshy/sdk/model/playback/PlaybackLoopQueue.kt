package me.meeshy.sdk.model.playback

/**
 * **La file de boucle du lecteur partagé** (iOS `PlaybackLoopQueue`, #9702) : un successeur du MÊME
 * média tenu derrière l'élément en cours, pour que le tour suivant enchaîne sans trou.
 *
 * Immuable : chaque opération rend la file suivante. [itemCount] compte l'élément en cours.
 */
public data class PlaybackLoopQueue(val itemCount: Int = 0) {

    /** Un successeur attend derrière l'élément en cours. */
    val hasSuccessor: Boolean get() = itemCount > 1

    /** Le résultat de [queueSuccessor] : la file suivante et si un successeur vient d'être inséré. */
    public data class Queued(val queue: PlaybackLoopQueue, val inserted: Boolean) {
        val queued: Boolean get() = queue.hasSuccessor
    }

    /** Met en file UN successeur du média en cours, s'il n'y est pas déjà. Sans élément en cours : rien. */
    public fun queueSuccessor(): Queued = when {
        itemCount <= 0 -> Queued(this, inserted = false)
        itemCount > 1 -> Queued(this, inserted = false)
        else -> Queued(copy(itemCount = 2), inserted = true)
    }

    /** La file enchaînera d'elle-même à la fin de l'élément en cours. */
    public fun advancesToQueuedSuccessor(loopActive: Boolean): Boolean = loopActive && hasSuccessor

    /** Le successeur devient l'élément en cours. */
    public fun advanced(): PlaybackLoopQueue = copy(itemCount = (itemCount - 1).coerceAtLeast(0))

    public fun dropSuccessors(): PlaybackLoopQueue = if (itemCount > 1) copy(itemCount = 1) else this

    public companion object {
        public fun withCurrentItem(): PlaybackLoopQueue = PlaybackLoopQueue(1)
    }
}
