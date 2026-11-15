package me.meeshy.app.ongoing

/**
 * Où une surface « en cours » se montre : le contrôleur décide, le puits pose ou retire la
 * notification. Séparé pour que les contrôleurs se jouent en JVM sans NotificationManager.
 */
internal interface OngoingNotificationSink<S> {
    /** Pose ou met à jour la notification en cours. */
    fun show(snapshot: S)

    /** Pose l'issue, qui n'est plus « en cours » et se retire seule après [dismissAfterMs]. */
    fun conclude(snapshot: S, dismissAfterMs: Long)

    /** Retire la notification, sans issue. */
    fun cancel()
}
