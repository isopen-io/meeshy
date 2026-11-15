package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import java.io.File
import kotlinx.coroutines.Dispatchers
import me.meeshy.feature.chat.R

/** Pose le récepteur de contenu riche sur la vue du composeur tant que celui-ci est à l'écran. */
@Composable
internal fun PasteContentReceiverEffect(onPickFile: (file: File, fileName: String, mimeType: String?) -> Unit) {
    val context = LocalContext.current
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    val pick = rememberUpdatedState(onPickFile)
    DisposableEffect(view) {
        val receiver = PasteContentReceiver(
            contentResolver = context.contentResolver,
            workDir = File(context.cacheDir, "paste"),
            scope = scope,
            ioDispatcher = Dispatchers.IO,
            onPickFile = { f, n, m -> pick.value(f, n, m) },
            onRejected = { Toast.makeText(context, R.string.paste_media_too_large, Toast.LENGTH_SHORT).show() },
        )
        PasteContentReceiver.install(view, receiver)
        onDispose { PasteContentReceiver.uninstall(view) }
    }
}
