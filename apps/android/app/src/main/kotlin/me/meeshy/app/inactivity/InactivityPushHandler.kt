package me.meeshy.app.inactivity

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.app.battery.ForegroundProbe
import me.meeshy.app.push.IncomingPush
import me.meeshy.sdk.inactivity.InactivityForegroundNotice
import me.meeshy.sdk.inactivity.InactivityForegroundNotices
import me.meeshy.sdk.model.inactivity.InactivityContract

/**
 * Les pushes de la vérification d'inactivité (#18738), avant le chemin des messages qui en ferait une bannière ordinaire :
 * - `inactivity_alert` app OUVERTE : la SyncPill défile l'annonce À LA PLACE de la bannière, jamais les deux. App
 *   fermée, ou aucune pastille montée, la bannière part comme tout push (son toucher ouvre le profil de la personne) ;
 * - `wellness_check` n'est JAMAIS avalé ici : « Tout va bien ? » part toujours en bannière, avec l'action « Je vais
 *   bien » ([WellnessActionProvider]).
 */
@Singleton
class InactivityPushHandler @Inject constructor(
    private val notices: InactivityForegroundNotices,
    private val foreground: ForegroundProbe,
) {
    /** `true` quand le push est traité ici ; `false` laisse passer le chemin suivant. */
    fun handle(push: IncomingPush): Boolean = when (push.payload.type ?: push.data["type"]) {
        InactivityContract.ALERT_NOTIFICATION_TYPE -> foreground.isForeground() && announce(push)
        else -> false
    }

    private fun announce(push: IncomingPush): Boolean {
        val label = listOfNotNull(push.payload.title ?: push.notificationTitle, push.payload.body ?: push.notificationBody)
            .map(String::trim)
            .filter(String::isNotEmpty)
            .joinToString(" · ")
        if (label.isEmpty()) return false
        val id = "inactivity:push:${push.payload.notificationId ?: label}"
        return notices.offer(InactivityForegroundNotice(id, label))
    }
}
