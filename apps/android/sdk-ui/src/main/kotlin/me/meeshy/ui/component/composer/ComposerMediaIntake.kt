package me.meeshy.ui.component.composer

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.readMediaUploadItem

/**
 * Ce que le composeur universel remet à une surface qui reçoit des [MediaUploadItem] (#14265) : une URI choisie
 * (photothèque) se lit hors du fil principal, un fichier produit (prise vocale, photo ou vidéo retouchée) est adopté
 * dans le cache privé. Chaque pièce lue rejoint l'hôte, une à une.
 */
@Stable
public class ComposerMediaIntake internal constructor(
    public val onUris: (List<Uri>) -> Unit,
    public val onFile: (file: File, fileName: String, mimeType: String?) -> Unit,
)

@Composable
public fun rememberComposerMediaIntake(onItem: (MediaUploadItem) -> Unit): ComposerMediaIntake {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val deliver by rememberUpdatedState(onItem)
    return remember(context, scope) {
        ComposerMediaIntake(
            onUris = { uris ->
                scope.launch {
                    uris.forEach { uri -> withContext(Dispatchers.IO) { context.readMediaUploadItem(uri) }?.let { deliver(it) } }
                }
            },
            onFile = { file, fileName, mimeType ->
                scope.launch {
                    withContext(Dispatchers.IO) {
                        MediaIntake.adopt(file, context.cacheDir, fileName, mimeType ?: GENERIC_MIME_TYPE)
                    }?.let { deliver(it) }
                }
            },
        )
    }
}

private const val GENERIC_MIME_TYPE = "application/octet-stream"
