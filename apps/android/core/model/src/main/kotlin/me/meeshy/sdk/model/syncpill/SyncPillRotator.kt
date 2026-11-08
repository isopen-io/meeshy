package me.meeshy.sdk.model.syncpill

/**
 * La rotation de la pastille (miroir d'iOS `SyncPillRotator`), en valeur immuable pilotée par une horloge injectée :
 * une entrée toutes les 2,7 s, en pause 5 s après un geste manuel, à l'arrêt pour une entrée ou moins, gelée à
 * l'appui long (WCAG 2.2.2). Le minuteur qui appelle [tick] vit côté écran.
 */
data class SyncPillRotator(
    val currentIndex: Int = 0,
    val itemCount: Int = 0,
    val autoRotationEnabled: Boolean = true,
    val pausedUntil: Long? = null,
) {
    /** La rotation tourne-t-elle : elle demande un minuteur seulement avec plusieurs entrées et sans gel. */
    val isRunning: Boolean get() = itemCount > 1 && autoRotationEnabled

    /** Réindexe quand la liste rétrécit ; zéro entrée remet l'index à 0. */
    fun withItemCount(count: Int): SyncPillRotator = copy(
        itemCount = count,
        currentIndex = if (count == 0 || currentIndex >= count) 0 else currentIndex,
    )

    fun withAutoRotation(enabled: Boolean): SyncPillRotator = copy(autoRotationEnabled = enabled)

    fun advance(now: Long): SyncPillRotator =
        if (itemCount <= 1) this else copy(currentIndex = (currentIndex + 1) % itemCount, pausedUntil = now + PAUSE_AFTER_TOUCH_MS)

    fun rewind(now: Long): SyncPillRotator =
        if (itemCount <= 1) this else copy(
            currentIndex = (currentIndex - 1 + itemCount) % itemCount,
            pausedUntil = now + PAUSE_AFTER_TOUCH_MS,
        )

    /** Un tic du minuteur : avance, sauf gel, entrée unique ou pause après un toucher encore en cours. */
    fun tick(now: Long): SyncPillRotator {
        if (!isRunning) return this
        val until = pausedUntil
        if (until != null && now < until) return this
        return copy(currentIndex = (currentIndex + 1) % itemCount, pausedUntil = null)
    }

    companion object {
        const val INTERVAL_MS: Long = 2_700L
        const val PAUSE_AFTER_TOUCH_MS: Long = 5_000L

        /** L'appui long qui gèle la rotation et le défilement. */
        const val FREEZE_PRESS_MS: Long = 500L
    }
}
