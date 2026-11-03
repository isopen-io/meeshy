package me.meeshy.ui.component.media

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.media.AutoDownloadStarter
import me.meeshy.sdk.media.MediaAvailabilityResolver
import me.meeshy.sdk.media.MediaRequest
import me.meeshy.sdk.model.media.MediaAvailabilityState

/** Le résolveur et l'auto-démarreur de l'app, fournis par l'hôte. */
@Immutable
public class MediaAvailabilityHost(
    internal val resolver: MediaAvailabilityResolver,
    internal val starter: AutoDownloadStarter,
)

/** `null` : aucun hôte n'a branché de résolveur — la pièce se montre prête, comme avant. */
public val LocalMediaAvailabilityHost = staticCompositionLocalOf<MediaAvailabilityHost?> { null }

/** L'état d'une pièce et ses deux gestes — un instantané immuable pour une rangée. */
@Immutable
public class MediaAvailabilityHandle(
    public val state: MediaAvailabilityState,
    public val onDownload: () -> Unit,
    public val onCancel: () -> Unit,
)

private val Inert = MediaAvailabilityHandle(MediaAvailabilityState.Ready, {}, {})

/**
 * La disponibilité de [request] : lue sur le disque au PREMIER rendu (aucun « télécharger » sur un fichier déjà là),
 * puis suivie par un Flow ; la pièce qui doit l'être démarre seule, une fois, quand la politique du type et du réseau
 * l'autorise.
 */
@Composable
public fun rememberMediaAvailability(request: MediaRequest): MediaAvailabilityHandle {
    val host = LocalMediaAvailabilityHost.current ?: return Inert
    val initial = remember(request) { host.resolver.atFirstRender(request) }
    val flow = remember(request) { host.resolver.observe(request) }
    val state by flow.collectAsState(initial)
    LaunchedEffect(request, state) { host.starter.maybeStart(request, state) }
    return remember(request, state) {
        MediaAvailabilityHandle(state, { host.resolver.download(request) }, { host.resolver.cancel(request) })
    }
}
