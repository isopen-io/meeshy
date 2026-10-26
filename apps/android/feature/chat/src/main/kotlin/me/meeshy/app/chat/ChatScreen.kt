package me.meeshy.app.chat

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import me.meeshy.ui.theme.MeeshySpacing
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor
import java.io.ByteArrayOutputStream
import java.io.InputStream
import me.meeshy.sdk.model.composer.ComposerAttachmentLimits

/**
 * The conversation screen: an assembly of five hosts drawn in layer order — background,
 * header, list, bottom bar and sheets — sharing one [ChatHostContext]. Each host owns its own
 * slice of the screen; this function only wires the ViewModel to them.
 */
@Composable
fun ChatScreen(
    onBack: () -> Unit,
    onStartCall: (peerName: String, isVideo: Boolean) -> Unit = { _, _ -> },
    onRejoinCall: (call: ActiveCallSession, peerName: String) -> Unit = { _, _ -> },
    onCreateShareLink: () -> Unit = {},
    /** True when THIS device is already engaged in a live call — suppresses the
     * « Rejoindre » pill so a minimised call viewing its own chat isn't offered
     * to rejoin the call it's already in. */
    hasLocalLiveCall: Boolean = false,
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val callEntry by viewModel.callEntry.collectAsStateWithLifecycle()

    // Re-probe the server for a still-active call each time the screen resumes
    // (returning from the call itself, an app relaunch mid-call) so the
    // « Rejoindre » pill reflects the server truth. Parité iOS ConversationView.
    LifecycleResumeEffect(Unit) {
        viewModel.refreshActiveCall()
        onPauseOrDispose { }
    }

    val accentColor = state.accentColorHex
        ?.let { hexColor(it) }
        ?.takeIf { it != Color.Unspecified }
        ?: MeeshyPalette.Indigo500
    val actions = remember(viewModel) { viewModel.hostActions() }
    val pendingTray = remember(viewModel) { viewModel.controllers.find<ComposerTrayController>() }
    val pending by (pendingTray?.state ?: NO_PENDING).collectAsStateWithLifecycle()
    val headerController = remember(viewModel) { viewModel.controllers.find<ChatHeaderController>() }
    val header by (headerController?.state ?: NO_HEADER).collectAsStateWithLifecycle()
    val readingModeController = remember(viewModel) { viewModel.controllers.find<ReadingModeController>() }
    val readingModeState by (readingModeController?.state ?: NO_READING_MODE).collectAsStateWithLifecycle()
    val readingMode = readingModeState?.let { modeState ->
        ChatReadingModeBinding(
            state = modeState,
            select = { readingModeController?.select(it) },
            resetToAuto = { readingModeController?.resetToAuto() },
        )
    }
    val host = rememberChatHostContext(
        state = state,
        composerText = viewModel.composerText,
        pending = pending,
        accentColor = accentColor,
        actions = actions,
        navigation = ChatNavigationActions(
            onBack = onBack,
            onStartCall = onStartCall,
            onRejoinCall = onRejoinCall,
            onCreateShareLink = onCreateShareLink,
            hasLocalLiveCall = hasLocalLiveCall,
            callEntry = callEntry,
        ),
        header = header,
        readingMode = readingMode,
    )

    ChatBackgroundHost {
        // L'en-tête est une bande FLOTTANTE posée au-dessus du fil (iOS : ZStack, zIndex 100) :
        // sa hauteur mesurée décale le haut du fil (`bandHeight`), et les bulles passent dessous.
        var headerHeightPx by remember { mutableIntStateOf(0) }
        val headerHeight = with(LocalDensity.current) { headerHeightPx.toDp() }
        // La barre de composition FLOTTE aussi (iOS : `ConversationComposerDock` superposé au fil) :
        // sa hauteur mesurée, clavier compris, devient la réserve basse du fil, et les bulles
        // défilent sous le verre.
        var composerHeightPx by remember { mutableIntStateOf(0) }
        val composerHeight = with(LocalDensity.current) { composerHeightPx.toDp() }
        Scaffold(containerColor = Color.Transparent) { _ ->
            Box(Modifier.fillMaxSize()) {
                ChatListHost(
                    host,
                    topInset = headerHeight,
                    bottomInset = composerHeight + MeeshySpacing.sm,
                )
                // Rangée plate (Script) : pendant un défilement du doigt, l'en-tête ET le composeur
                // s'effacent par opacité — aucun inset ne bouge — et reviennent à l'arrêt ; sauf
                // recherche ouverte ou suggestions de mention (iOS `FocalChromeReturn`).
                val chromeHidden = host.readingMode?.state?.mode?.usesFlatRow == true &&
                    host.chrome.isUserScrolling &&
                    !state.search.isActive &&
                    !state.mention.isActive
                val chromeAlpha by animateFloatAsState(
                    targetValue = if (chromeHidden) 0f else 1f,
                    animationSpec = tween((FocalMetrics.HiddenChrome.EASE_OUT_SECONDS * 1000).toInt()),
                    label = "flat-chrome",
                )
                Box(
                    Modifier
                        .onSizeChanged { headerHeightPx = it.height }
                        .graphicsLayer { alpha = chromeAlpha },
                ) {
                    ChatHeaderHost(host)
                }
                Box(
                    Modifier
                        .align(Alignment.BottomCenter)
                        .onSizeChanged { composerHeightPx = it.height }
                        .graphicsLayer { alpha = chromeAlpha },
                ) {
                    ChatBottomBarHost(host)
                }
            }
        }
        ChatSheetsHost(host)
    }
}

/**
 * The bytes + display name + declared content-type read back from a picked content Uri.
 * Shared with [me.meeshy.app.chat.ShareTargetScreen] (an inbound `ACTION_SEND` attachment is
 * read through the exact same content-Uri glue as a locally picked one).
 */
internal data class PickedAttachment(
    val bytes: ByteArray,
    val fileName: String,
    val mimeType: String?,
)

/**
 * Reads a document/photo the user picked from the system picker into memory,
 * resolving its display name and the platform's declared content-type. Returns
 * `null` when the stream cannot be opened (a revoked grant / deleted document) or
 * when the file is above the upload ceiling ([ComposerAttachmentLimits.MAX_UPLOAD_BYTES]):
 * a long video is never pulled whole into memory. The byte read and cursor query are
 * the Android-framework glue behind the pure send pipeline.
 */
internal fun readPickedAttachment(context: Context, uri: Uri): PickedAttachment? {
    val resolver = context.contentResolver
    val bytes = runCatching {
        resolver.openInputStream(uri)?.use { readWithin(it, ComposerAttachmentLimits.MAX_UPLOAD_BYTES) }
    }.getOrNull() ?: return null
    val fileName = queryDisplayName(resolver, uri) ?: uri.lastPathSegment ?: "attachment"
    return PickedAttachment(bytes = bytes, fileName = fileName, mimeType = resolver.getType(uri))
}

private fun queryDisplayName(resolver: ContentResolver, uri: Uri): String? =
    runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (!cursor.moveToFirst()) return@use null
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0) cursor.getString(index) else null
        }
    }.getOrNull()

/** Reads [input] whole, or `null` as soon as it runs past [maxBytes] — never more than the ceiling. */
internal fun readWithin(input: InputStream, maxBytes: Long): ByteArray? {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(READ_BUFFER_BYTES)
    var total = 0L
    while (true) {
        val read = input.read(buffer)
        if (read < 0) return out.toByteArray()
        total += read
        if (total > maxBytes) return null
        out.write(buffer, 0, read)
    }
}

private const val READ_BUFFER_BYTES = 64 * 1024
