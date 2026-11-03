package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.AutoDownloadDecision
import me.meeshy.sdk.model.MediaAutoDownloadDecider
import me.meeshy.sdk.model.MediaAvailability
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition

/** Les faits, déjà collectés, dont se déduit la disponibilité d'une pièce. */
public data class MediaAvailabilityFacts(
    /** Média en cours d'envoi : jamais d'état de téléchargement. */
    val isOptimistic: Boolean = false,
    /** L'adresse est un `file:`. */
    val isLocalFile: Boolean = false,
    val localFileExists: Boolean = false,
    /** Le cache typé détient le fichier entier sous sa clé. */
    val inTypedStore: Boolean = false,
    /** Le téléchargement en cours, s'il y en a un. */
    val progress: DownloadProgress? = null,
    /** Le dernier essai a échoué (`gone` = rappelé / expiré), `null` sinon. */
    val failure: AttachmentDownloadEvent.Failed? = null,
    val expectedSizeBytes: Long = 0L,
    val offline: Boolean = false,
)

/**
 * **La table prêt / à télécharger / en cours / échec** et la décision d'auto-démarrage, en loi pure. Rien ne bloque
 * l'affichage d'un aperçu déjà en cache : un fichier présent est toujours [MediaAvailabilityState.Ready], hors ligne compris.
 */
public object MediaAvailabilityResolution {

    public fun resolve(facts: MediaAvailabilityFacts): MediaAvailabilityState {
        if (facts.isOptimistic) return MediaAvailabilityState.Ready
        facts.progress?.let { return downloading(it, facts.expectedSizeBytes) }
        val onDevice = if (facts.isLocalFile) facts.localFileExists else facts.inTypedStore
        if (onDevice) return MediaAvailabilityState.Ready
        val size = facts.expectedSizeBytes.coerceAtLeast(0L)
        facts.failure?.let { return MediaAvailabilityState.Failed(it.gone, size) }
        return MediaAvailabilityState.NeedsDownload(size, facts.offline)
    }

    private fun downloading(progress: DownloadProgress, expected: Long): MediaAvailabilityState.Downloading =
        MediaAvailabilityState.Downloading(
            downloadedBytes = progress.downloadedBytes.coerceAtLeast(0L),
            totalBytes = progress.totalBytes.takeIf { it > 0 } ?: expected.coerceAtLeast(0L),
        )

    /** La disponibilité vue par [MediaAutoDownloadDecider]. Un échec n'est pas relancé seul : il attend le toucher. */
    public fun MediaAvailabilityState.toAvailability(): MediaAvailability = when (this) {
        MediaAvailabilityState.Ready -> MediaAvailability.AVAILABLE
        is MediaAvailabilityState.Downloading -> MediaAvailability.DOWNLOADING
        is MediaAvailabilityState.NeedsDownload, is MediaAvailabilityState.Failed -> MediaAvailability.NEEDS_DOWNLOAD
    }

    /**
     * Le téléchargement doit-il démarrer seul ? Seule une pièce « à télécharger » que la politique de son type et du
     * réseau autorise part, et une seule fois ([alreadyStarted]) ; un échec ne repart jamais seul.
     */
    public fun shouldAutoStart(
        state: MediaAvailabilityState,
        kind: MediaKind?,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences,
        alreadyStarted: Boolean,
    ): Boolean {
        if (alreadyStarted || state !is MediaAvailabilityState.NeedsDownload) return false
        val decision = MediaAutoDownloadDecider.decide(
            kind = kind,
            availability = state.toAvailability(),
            condition = condition,
            prefs = prefs,
            sizeBytes = state.sizeBytes.takeIf { it > 0 },
        )
        return decision == AutoDownloadDecision.DOWNLOAD
    }
}
