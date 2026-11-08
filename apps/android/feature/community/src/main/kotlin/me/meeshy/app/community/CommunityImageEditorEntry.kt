package me.meeshy.app.community

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.io.ByteArrayInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.ImageBudgetEncoder
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.imageedit.ImageEditorContext
import me.meeshy.sdk.model.media.ImageByteBudget
import me.meeshy.ui.component.imageedit.MeeshyImageEditorScreen
import me.meeshy.ui.component.retouch.RetouchSourceDecoder

private const val EDITOR_LONG_SIDE = 3072

/** La photo choisie en attente de son recadrage. */
@Stable
internal class CommunityImageEditorFlow(
    private val context: Context,
    private val onReady: (ImageUploadTarget, MediaUploadItem) -> Unit,
) {
    var pending by mutableStateOf<Pair<ImageUploadTarget, MediaUploadItem>?>(null)
        private set
    var compressing by mutableStateOf(false)
        private set

    fun offer(target: ImageUploadTarget, item: MediaUploadItem) {
        pending = target to item
    }

    fun cancel() {
        pending?.let { MediaIntake.release(it.second) }
        pending = null
    }

    fun passthrough() {
        val (target, item) = pending ?: return
        pending = null
        onReady(target, item)
    }

    /** « Terminé » : le rendu est ramené sous le budget d'octets de la cible (500 Ko avatar, 800 Ko bannière), hors du fil principal. */
    suspend fun accept(target: ImageUploadTarget, source: MediaUploadItem, edited: Bitmap) {
        if (compressing) return
        compressing = true
        try {
            val bytes = withContext(Dispatchers.Default) {
                ImageBudgetEncoder.encode(edited, ImageByteBudget.forTarget(target), checkActive = { ensureActive() })
            }
            val name = if (target == ImageUploadTarget.AVATAR) "avatar.jpg" else "banner.jpg"
            val result = withContext(Dispatchers.IO) { MediaIntake.copy(ByteArrayInputStream(bytes), context.cacheDir, name, "image/jpeg") }
            MediaIntake.release(source)
            pending = null
            if (result != null) onReady(target, result)
        } finally {
            compressing = false
        }
    }
}

@Composable
internal fun rememberCommunityImageEditor(onReady: (ImageUploadTarget, MediaUploadItem) -> Unit): CommunityImageEditorFlow {
    val context = LocalContext.current.applicationContext
    return remember(context) { CommunityImageEditorFlow(context, onReady) }
}

@Composable
internal fun CommunityImageEditorHost(flow: CommunityImageEditorFlow) {
    val (target, item) = flow.pending ?: return
    var image by remember(item) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(item) {
        val decoded = withContext(Dispatchers.IO) { runCatching { RetouchSourceDecoder.decode(item.bytes, EDITOR_LONG_SIDE) }.getOrNull() }
        if (decoded == null) flow.passthrough() else image = decoded
    }
    val bitmap = image ?: return
    val scope = rememberCoroutineScope()
    Dialog(
        onDismissRequest = flow::cancel,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(Modifier.fillMaxSize()) {
            MeeshyImageEditorScreen(
                image = bitmap,
                context = if (target == ImageUploadTarget.AVATAR) ImageEditorContext.AVATAR else ImageEditorContext.BANNER,
                onAccept = { edited -> scope.launch { flow.accept(target, item, edited) } },
                onCancel = flow::cancel,
            )
            if (flow.compressing) CircularProgressIndicator(Modifier.align(Alignment.Center))
        }
    }
}
