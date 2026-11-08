package me.meeshy.app.widget

/**
 * La cadence du filet périodique des widgets (WorkManager) : le flux Room reste le chemin rapide,
 * ce rendez-vous rattrape ce qu'aucun flux ne signale (horloge « il y a 5 min », palier de présence
 * échu, process tué). 30 minutes tant qu'il y a des conversations non lues, 60 sinon, et 60 hors session.
 */
internal object WidgetRefreshSchedule {
    const val ACTIVE_MINUTES: Long = 30
    const val IDLE_MINUTES: Long = 60

    fun intervalMinutes(signedIn: Boolean, hasUnread: Boolean): Long =
        if (signedIn && hasUnread) ACTIVE_MINUTES else IDLE_MINUTES
}
