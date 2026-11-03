package me.meeshy.sdk.model.sync

/**
 * Quand une synchro de conversations doit passer au balayage COMPLET — miroir de `isFullReconcileDue`
 * et de l'escalade de `syncSinceLastCheckpoint` (iOS). Le delta est upsert-only : il ne voit jamais
 * une conversation supprimée pour de bon. Seul le balayage complet purge ces fantômes, une fois par
 * [INTERVAL_MILLIS]. Le curseur d'un delta n'avance que si la fenêtre est prouvée complète.
 */
object ReconcilePlan {
    /** 24 h, comme `fullReconcileInterval` côté iOS et `FULL_RECONCILE_INTERVAL_MS` côté web. */
    const val INTERVAL_MILLIS: Long = 86_400_000L

    /** Jamais réconcilié (`null`) ⇒ dû, comme iOS (`lastFullReconcileAt ?? .distantPast`). */
    fun isDue(lastFullReconcile: Long?, now: Long, interval: Long = INTERVAL_MILLIS): Boolean =
        lastFullReconcile == null || now - lastFullReconcile >= interval

    /** Un delta abouti qui laisse du reste, ou une fenêtre de 24 h échue, escalade vers le plein. */
    fun shouldEscalate(deltaSucceeded: Boolean, mayHaveMore: Boolean, due: Boolean): Boolean =
        deltaSucceeded && (mayHaveMore || due)
}
