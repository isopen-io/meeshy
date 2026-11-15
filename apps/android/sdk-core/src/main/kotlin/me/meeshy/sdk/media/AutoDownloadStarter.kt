package me.meeshy.sdk.media

import me.meeshy.sdk.model.cacheCategory
import me.meeshy.sdk.model.media.DownloadOrigin
import me.meeshy.sdk.model.media.MediaAvailabilityResolution
import me.meeshy.sdk.model.media.MediaAvailabilityState
import java.util.concurrent.ConcurrentHashMap

/**
 * **L'auto-démarrage une seule fois par pièce** (miroir de la garde `.task(id: fileUrl)` des résolveurs iOS) : la
 * politique du type et du réseau décide ([MediaAvailabilityResolution.shouldAutoStart]), la clé de cache du média
 * mémorise qu'on a déjà essayé. Une pièce déjà en vol, déjà là ou en échec ne repart pas seule ; le registre unique
 * dédoublonne de toute façon un second lancement sur la même clé.
 */
class AutoDownloadStarter(
    private val center: AttachmentDownloadCenter,
    private val preferences: MediaDownloadPreferencesStore,
    private val network: NetworkConditionMonitor,
) {
    private val started = ConcurrentHashMap.newKeySet<String>()

    /** Rend `true` quand un téléchargement automatique vient d'être lancé pour [request]. */
    fun maybeStart(request: MediaRequest, state: MediaAvailabilityState): Boolean {
        val key = center.key(request.url)
        if (key.isEmpty() || state !is MediaAvailabilityState.NeedsDownload) return false
        val allowed = MediaAvailabilityResolution.shouldAutoStart(
            state = state,
            kind = request.kind,
            condition = network.condition.value,
            prefs = preferences.preferences.value,
            alreadyStarted = key in started,
        )
        if (!allowed || !started.add(key)) return false
        center.start(request.url, request.expectedSizeBytes, request.kind.cacheCategory(), DownloadOrigin.AUTOMATIC)
        return true
    }

    /** Oublie la pièce : un vidage de cache la rend de nouveau éligible. */
    fun forget(url: String) {
        started.remove(center.key(url))
    }
}
