package me.meeshy.sdk.media

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.cacheCategory
import me.meeshy.sdk.model.media.AttachmentDownloadEvent
import me.meeshy.sdk.model.media.DownloadOrigin
import me.meeshy.sdk.model.media.DownloadProgress
import me.meeshy.sdk.model.media.LocalFileUrl
import me.meeshy.sdk.model.media.MediaAvailabilityFacts
import me.meeshy.sdk.model.media.MediaAvailabilityResolution
import me.meeshy.sdk.model.media.MediaAvailabilityState

/** Une pièce dont on veut connaître la disponibilité : son adresse, son genre (donc sa préférence) et sa taille annoncée. */
data class MediaRequest(
    val url: String,
    val kind: MediaKind,
    val expectedSizeBytes: Long = 0L,
    val isOptimistic: Boolean = false,
)

/**
 * **Le résolveur de disponibilité des médias** (miroir d'`AudioAvailabilityResolver` / `VideoAvailabilityResolver`,
 * iOS) : fichier local ou cache typé d'abord, puis le téléchargement du registre unique ([AttachmentDownloadCenter]),
 * puis le dernier échec. [atFirstRender] lit le disque en SYNCHRONE : un média déjà là ne se dessine jamais « télécharger ».
 * [observe] rend un Flow par pièce, qui ne bloque jamais l'affichage d'un aperçu déjà en cache.
 *
 * L'échec est tenu par clé (le registre ne diffuse que des événements) jusqu'au prochain essai.
 */
class MediaAvailabilityResolver(
    private val center: AttachmentDownloadCenter,
    private val network: NetworkConditionMonitor,
    scope: CoroutineScope,
    private val fileExists: (path: String) -> Boolean = { java.io.File(it).isFile },
) {
    private val failures = MutableStateFlow<Map<String, AttachmentDownloadEvent.Failed>>(emptyMap())

    init {
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            center.events.collect { keyed ->
                try {
                    failures.value = when (val event = keyed.event) {
                        is AttachmentDownloadEvent.Failed -> failures.value + (keyed.key to event)
                        else -> failures.value - keyed.key
                    }
                } catch (_: Exception) {
                }
            }
        }
    }

    /** Disponibilité au repos, lue sur le disque sans changer d'exécuteur. */
    fun atFirstRender(request: MediaRequest): MediaAvailabilityState =
        resolve(request, center.progress(center.key(request.url)), failures.value[center.key(request.url)], network.condition.value)

    /** La disponibilité de la pièce, rejouée à chaque progression, fin, échec ou changement de réseau. */
    fun observe(request: MediaRequest): Flow<MediaAvailabilityState> {
        val key = center.key(request.url)
        return combine(
            center.active.map { it[key] }.distinctUntilChanged(),
            failures.map { it[key] }.distinctUntilChanged(),
            network.condition,
        ) { progress, failure, condition -> resolve(request, progress, failure, condition) }.distinctUntilChanged()
    }

    /**
     * Le toucher : lance (ou rejoint) le téléchargement MANUEL. Hors ligne et sans cache, rien ne part : le badge est
     * désactivé. Rend `true` si un téléchargement a été demandé.
     */
    fun download(request: MediaRequest): Boolean {
        val state = atFirstRender(request)
        if (state !is MediaAvailabilityState.NeedsDownload && state !is MediaAvailabilityState.Failed) return false
        if (network.condition.value == NetworkCondition.OFFLINE) return false
        failures.value = failures.value - center.key(request.url)
        center.start(request.url, request.expectedSizeBytes, request.kind.cacheCategory(), DownloadOrigin.MANUAL)
        return true
    }

    fun cancel(request: MediaRequest) = center.cancel(request.url)

    private fun resolve(
        request: MediaRequest,
        progress: DownloadProgress?,
        failure: AttachmentDownloadEvent.Failed?,
        condition: NetworkCondition,
    ): MediaAvailabilityState {
        val isLocal = LocalFileUrl.isLocal(request.url)
        return MediaAvailabilityResolution.resolve(
            MediaAvailabilityFacts(
                isOptimistic = request.isOptimistic,
                isLocalFile = isLocal,
                localFileExists = isLocal && LocalFileUrl.pathOf(request.url)?.let(fileExists) == true,
                inTypedStore = !isLocal && center.isInTypedStore(request.kind.cacheCategory(), request.url),
                progress = progress,
                failure = failure,
                expectedSizeBytes = request.expectedSizeBytes,
                offline = condition == NetworkCondition.OFFLINE,
            ),
        )
    }
}
