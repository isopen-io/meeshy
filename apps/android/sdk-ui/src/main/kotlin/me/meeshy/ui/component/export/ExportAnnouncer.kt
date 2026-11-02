package me.meeshy.ui.component.export

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalAccessibilityManager
import kotlinx.coroutines.delay

/**
 * Ce qu'un export dit à sa fin : [message], et pour un échec ([failed]) le geste qui le relance ([retryLabel], [onRetry]).
 * L'identité fait foi : un écran retire SON annonce, jamais celle d'un autre.
 */
@Stable
class ExportAnnouncement(
    val message: String,
    val failed: Boolean = false,
    val retryLabel: String? = null,
    val onRetry: (() -> Unit)? = null,
)

/**
 * **L'annonceur des exports** (#14557) : UN par application, posé à sa racine, si bien qu'une annonce survit à l'écran
 * qui l'a faite — la feuille « Imager » se ferme au succès, le compositeur peut se fermer pendant que son bandeau parle.
 * Le compositeur et l'atelier des cartes passent tous deux par lui : un seul bandeau de fin d'export dans l'application.
 */
@Stable
class ExportAnnouncer {
    var current: ExportAnnouncement? by mutableStateOf(null)
        private set

    fun announce(announcement: ExportAnnouncement) {
        current = announcement
    }

    fun withdraw(announcement: ExportAnnouncement) {
        if (current === announcement) current = null
    }
}

/** L'annonceur de l'application ; `null` hors de sa racine (un témoin, un écran isolé). */
val LocalExportAnnouncer = staticCompositionLocalOf<ExportAnnouncer?> { null }

/** Monte le bandeau de l'annonce courante, puis la retire une fois lue ; « Réessayer » la retire et relance. */
@Composable
fun ExportAnnouncerHost(announcer: ExportAnnouncer) {
    val announcement = announcer.current ?: return
    AnnouncementTimeout(announcement) { announcer.withdraw(announcement) }
    ExportBandWindow {
        ExportOutcomeBand(
            message = announcement.message,
            failed = announcement.failed,
            retryLabel = announcement.retryLabel,
            onRetry = {
                announcer.withdraw(announcement)
                announcement.onRetry?.invoke()
            },
        )
    }
}

/** L'annonceur de l'application ; à défaut, un annonceur propre à cet écran, monté ici. */
@Composable
fun rememberExportAnnouncer(): ExportAnnouncer {
    val application = LocalExportAnnouncer.current
    if (application != null) return application
    val local = remember { ExportAnnouncer() }
    ExportAnnouncerHost(local)
    return local
}

@Composable
private fun AnnouncementTimeout(announcement: ExportAnnouncement, onShown: () -> Unit) {
    val accessibility = LocalAccessibilityManager.current
    val shown by rememberUpdatedState(onShown)
    LaunchedEffect(announcement) {
        val millis = accessibility?.calculateRecommendedTimeoutMillis(
            originalTimeoutMillis = ExportBandTiming.OUTCOME_MILLIS,
            containsIcons = false,
            containsText = true,
            containsControls = announcement.retryLabel != null,
        ) ?: ExportBandTiming.OUTCOME_MILLIS
        delay(millis)
        shown()
    }
}
