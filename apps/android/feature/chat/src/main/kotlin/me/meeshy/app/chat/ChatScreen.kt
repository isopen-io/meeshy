package me.meeshy.app.chat

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor

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
    val host = rememberChatHostContext(
        state = state,
        pending = pending,
        accentColor = accentColor,
        actions = actions,
        navigation = ChatNavigationActions(
            onBack = onBack,
            onStartCall = onStartCall,
            onRejoinCall = onRejoinCall,
            onCreateShareLink = onCreateShareLink,
            hasLocalLiveCall = hasLocalLiveCall,
        ),
    )

    ChatBackgroundHost {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = { ChatHeaderHost(host) },
            bottomBar = { ChatBottomBarHost(host) },
        ) { padding ->
            ChatListHost(host, Modifier.padding(padding))
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
 * `null` when the stream cannot be opened (a revoked grant / deleted document) so
 * the composer silently ignores the pick rather than crashing. The byte read and
 * cursor query are the Android-framework glue behind the pure send pipeline.
 */
internal fun readPickedAttachment(context: Context, uri: Uri): PickedAttachment? {
    val resolver = context.contentResolver
    val bytes = runCatching { resolver.openInputStream(uri)?.use { it.readBytes() } }
        .getOrNull() ?: return null
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

