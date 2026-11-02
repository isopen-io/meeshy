package me.meeshy.app.widget

import android.content.res.Configuration
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import me.meeshy.sdk.model.PresenceState

/**
 * Quand redessiner les widgets posés. Ils se peignent depuis le cache local, sans réseau, donc
 * seul un changement de ce cache (message reçu, lecture, épingle, compte), de la langue du
 * lecteur, du thème système ou du palier de présence d'un contact affiché (`WidgetPresenceTiers`)
 * les rend périmés. Les rafales (une synchronisation écrit vingt
 * lignes) se rejoignent en UNE repeinte : `updateAll` n'est pas gratuit, et l'écran d'accueil ne
 * montre que l'état final.
 */
internal object WidgetRepaintPolicy {

    const val BURST_WINDOW_MILLIS: Long = 400

    @OptIn(FlowPreview::class)
    fun triggers(
        cacheFingerprint: Flow<Int>,
        requests: Flow<Unit>,
        presenceTiers: Flow<Map<String, PresenceState>> = emptyFlow(),
        burstWindowMillis: Long = BURST_WINDOW_MILLIS,
    ): Flow<Unit> = merge(cacheFingerprint.map { }, requests, presenceTiers.map { }).debounce(burstWindowMillis)
}

/** Reconnaît le passage clair ⇄ sombre : la seule bascule de configuration qui change la peinture. */
internal class NightModeChange(initialUiMode: Int) {
    private var night = isNight(initialUiMode)

    /** `true` à la première configuration dont le mode nuit diffère de la précédente. */
    fun observe(uiMode: Int): Boolean {
        val now = isNight(uiMode)
        if (now == night) return false
        night = now
        return true
    }

    private fun isNight(uiMode: Int): Boolean =
        uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
}
