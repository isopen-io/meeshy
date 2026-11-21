package me.meeshy.app.fall

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.app.battery.ForegroundProbe
import me.meeshy.app.push.IncomingPush
import me.meeshy.sdk.fall.FallStore
import me.meeshy.sdk.model.fall.FallContract

/**
 * Les pushes de l'alerte de sécurité (#18748, la chute détectée), avant le chemin des messages qui en ferait une
 * bannière ordinaire. Le push est GÉNÉRIQUE (`safety_alert`, aucun mot de santé chez Google) :
 * - `safety_alert` app OUVERTE : avalé — `fall:detected` a déjà fait défiler la SyncPill et peint l'état ; app fermée,
 *   la bannière part comme tout push ;
 * - `safety_alert_cleared` : l'état de la personne nommée disparaît TOUJOURS, comme à `fall:cleared` ; app ouverte, la
 *   bannière ne part pas (la socket a dit « va bien ») ; app fermée, elle REMPLACE l'alerte sous la même clé.
 */
@Singleton
class FallPushHandler internal constructor(
    private val clear: (String) -> Unit,
    private val foreground: ForegroundProbe,
) {
    @Inject
    constructor(store: FallStore, foreground: ForegroundProbe) : this(store::clearFromPush, foreground)

    /** `true` quand le push est traité ici ; `false` laisse passer le chemin suivant. */
    fun handle(push: IncomingPush): Boolean {
        val type = push.payload.type ?: push.data["type"]
        FallContract.clearedUserId(push.data)?.let(clear)
        return type in FallContract.PUSH_TYPES && foreground.isForeground()
    }
}
