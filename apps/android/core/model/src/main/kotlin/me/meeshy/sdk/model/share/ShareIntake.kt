package me.meeshy.sdk.model.share

/**
 * **Ce qu'une autre app me remet est trié, borné et nommé sans risque** (#14605) — miroir de
 * `ShareExtractionReduction`, `ShareMediaStagingError`, `ShareExtensionIncoming.shortfalls` et
 * `ShareLifecycleGates` (extension iOS).
 */

/** Un fichier déjà copié dans l'espace privé du partage. [relPath] est relatif ; [originalName] est assaini. */
data class ShareStagedMedia(
    val relPath: String,
    val ext: String,
    val mime: String,
    val bytes: Long,
    val originalName: String? = null,
) {
    /** Le nom que le serveur reçoit : l'original, sinon celui de la copie. */
    val uploadFileName: String get() = originalName ?: relPath.substringAfterLast('/')
}

sealed interface ShareStagingError {
    data class ByteBudgetExceeded(val total: Long, val limit: Long) : ShareStagingError
    data class FileCountExceeded(val count: Int, val limit: Int) : ShareStagingError
    data class InsufficientFreeSpace(val needed: Long, val free: Long) : ShareStagingError
    data class CopyFailed(val reason: String) : ShareStagingError

    /** La pièce dépasse [limit] octets ([ShareStagingPolicy.MAX_FILE_BYTES]) : elle ne partirait pas, l'écran la nomme. */
    data class TooLarge(val fileName: String, val limit: Long) : ShareStagingError

    /** La source n'est pas un fichier que le système a remis (chemin seul, espace privé de l'app). */
    data object RefusedSource : ShareStagingError
    data object NotAvailableOffline : ShareStagingError
    data object DestinationOutsideShare : ShareStagingError

    val isOverBudget: Boolean get() = this is ByteBudgetExceeded || this is FileCountExceeded
}

/** Pourquoi des pièces remises ne partent pas — jamais silencieux. */
sealed interface ShareShortfall {
    /** Non préparé : hors ligne, disque plein, copie échouée. */
    data object Unprepared : ShareShortfall

    /** Ces pièces n'ont pas été copiées : elles dépassaient le plafond du partage. */
    data class OverBudget(val uncopied: Int) : ShareShortfall

    /** L'app n'a remis qu'un chemin de fichier, que Meeshy n'ouvre pas. */
    data object RefusedSource : ShareShortfall
}

sealed interface ShareProviderPayload {
    data class Text(val value: String?) : ShareProviderPayload
    data class Url(val value: String?) : ShareProviderPayload
}

data class ShareStagingResult(val index: Int, val outcome: Result<ShareStagedMedia>) {
    val error: ShareStagingError? get() = (outcome.exceptionOrNull() as? ShareStagingException)?.error

    companion object {
        fun success(index: Int, media: ShareStagedMedia) = ShareStagingResult(index, Result.success(media))
        fun failure(index: Int, error: ShareStagingError) =
            ShareStagingResult(index, Result.failure(ShareStagingException(error)))
    }
}

class ShareStagingException(val error: ShareStagingError) : Exception(error.toString())

/** Ce qu'un fournisseur a rendu : un morceau de texte, un fichier copié (ou son échec), ou rien. */
sealed interface ShareLoadOutcome {
    data class Payload(val payload: ShareProviderPayload) : ShareLoadOutcome
    data class Staged(val result: ShareStagingResult) : ShareLoadOutcome
    data object None : ShareLoadOutcome
}

/** Ce que l'écran reçoit : le texte composé, les fichiers copiés et chaque manque, dans l'ordre. */
data class ShareGathered(
    val content: String?,
    val media: List<ShareStagedMedia>,
    val failures: List<ShareStagingError>,
) {
    val failure: ShareStagingError? get() = failures.firstOrNull()
    val shortfalls: List<ShareShortfall> get() = ShareIntake.shortfalls(failures)
}

object ShareIntake {
    /** [outcomes] est dans l'ordre des fournisseurs : c'est lui qui fait foi, jamais l'ordre d'arrivée. */
    fun gathered(outcomes: List<ShareLoadOutcome>): ShareGathered {
        val payloads = outcomes.filterIsInstance<ShareLoadOutcome.Payload>().map { it.payload }
        val results = outcomes.filterIsInstance<ShareLoadOutcome.Staged>().map { it.result }
        val (text, url) = content(payloads)
        val (media, failures) = staging(results)
        return ShareGathered(composeContent(text, url), media, failures)
    }

    fun content(payloads: List<ShareProviderPayload>): Pair<String?, String?> {
        val text = payloads.filterIsInstance<ShareProviderPayload.Text>().mapNotNull { it.value }.firstOrNull { it.isNotEmpty() }
        val url = payloads.filterIsInstance<ShareProviderPayload.Url>().firstNotNullOfOrNull { it.value }
        return text to url
    }

    fun staging(results: List<ShareStagingResult>): Pair<List<ShareStagedMedia>, List<ShareStagingError>> {
        val ordered = results.sortedBy { it.index }
        return ordered.mapNotNull { it.outcome.getOrNull() } to ordered.mapNotNull { it.error }
    }

    /** Le titre porte le sens, l'URL la destination : les deux quand ils diffèrent, sans doublon. */
    fun composeContent(text: String?, url: String?): String? {
        val clean = text?.trim()?.takeIf { it.isNotEmpty() }
        return when {
            clean == null -> url
            url == null -> clean
            clean == url -> url
            else -> "$clean\n$url"
        }
    }

    /** Une raison par sorte d'échec, jamais une par fichier. */
    fun shortfalls(failures: List<ShareStagingError>): List<ShareShortfall> {
        val overBudget = failures.count { it.isOverBudget }
        val refused = failures.count { it is ShareStagingError.RefusedSource }
        val others = failures.size - overBudget - refused
        return listOfNotNull(
            if (refused > 0) ShareShortfall.RefusedSource else null,
            if (overBudget > 0) ShareShortfall.OverBudget(overBudget) else null,
            if (others > 0) ShareShortfall.Unprepared else null,
        )
    }
}

/** Annuler n'efface les copies que sans envoi tenté ni fiche qui les décrive. */
object ShareCancelPolicy {
    /** Dès qu'un envoi a été TENTÉ, Annuler n'a plus de sens ; ne dépend jamais de « envoi en cours ». */
    fun isCancelAllowed(sendWasAttempted: Boolean): Boolean = !sendWasAttempted

    fun mayDiscardStagedMedia(sendWasAttempted: Boolean, holdsPendingRecord: Boolean): Boolean =
        isCancelAllowed(sendWasAttempted) && !holdsPendingRecord
}

/** Verrou à sens unique : la fin n'est tirée qu'une fois, même sous concurrence. */
class ShareCompletionGate {
    private val fired = java.util.concurrent.atomic.AtomicBoolean(false)

    val hasFired: Boolean get() = fired.get()

    fun fireOnce(action: () -> Unit): Boolean {
        if (!fired.compareAndSet(false, true)) return false
        action()
        return true
    }
}
