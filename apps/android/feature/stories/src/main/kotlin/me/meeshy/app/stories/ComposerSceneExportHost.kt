package me.meeshy.app.stories

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.widget.Toast
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.scene.ComposerOverflowEntries
import me.meeshy.sdk.model.composer.scene.ComposerOverflowEntry
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow

/**
 * L'export de la scène vu de l'écran : la capture de ce que l'auteur VOIT (passe `FULL`, ou les objets seuls sur un fond
 * vidéo), le bake confié à [SceneExportViewModel], le voile qui le recouvre et la remise du fichier (galerie, partage).
 */
@Stable
internal class SceneExportHost(
    val capture: SceneCapture,
    val entries: List<ComposerOverflowEntry>,
    val isExporting: Boolean,
    private val startExport: (ComposerOverflowEntry) -> Unit,
) {
    fun start(entry: ComposerOverflowEntry) = startExport(entry)
}

@Composable
internal fun rememberSceneExportHost(state: StoryComposerUiState, viewModel: StoryComposerViewModel): SceneExportHost {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val exportViewModel: SceneExportViewModel = hiltViewModel()
    val exportState by exportViewModel.state.collectAsStateWithLifecycle()
    val layer = rememberGraphicsLayer()
    var pass by remember { mutableStateOf(SceneCapturePass.NONE) }
    val failed = stringResource(R.string.stories_scene_export_failed)
    val saved = stringResource(R.string.stories_scene_export_saved)
    val shareTitle = stringResource(R.string.stories_scene_overflow_share)

    LaunchedEffect(exportState) {
        when (val export = exportState) {
            SceneExportState.Saved -> toast(context, saved).also { exportViewModel.acknowledge() }
            SceneExportState.Failed -> toast(context, failed).also { exportViewModel.acknowledge() }
            is SceneExportState.Ready -> {
                shareScene(context, File(export.path), shareTitle)
                exportViewModel.handedOver()
            }
            else -> Unit
        }
    }
    ExportProgressDialog(fraction = exportState.veilFraction, onCancel = exportViewModel::cancel)
    val permissions = rememberPermissionFlow()
    PermissionFlowHost(permissions)

    return SceneExportHost(
        capture = SceneCapture(layer, pass),
        entries = ComposerOverflowEntries.served(hasScene = SceneExportSources.hasScene(state)),
        isExporting = exportState.isExporting,
        startExport = { entry ->
            val sources = SceneExportSources.from(state, viewModel::playableSoundUrl)
            scope.launch {
                // Android 8–9 : l'album s'écrit sous WRITE_EXTERNAL_STORAGE, demandé par la porte unique ; dès l'API 29, rien.
                if (entry.destination == SceneExportDestination.GALLERY &&
                    !permissions.ensure(PermissionNature.PHOTO_LIBRARY_ADD)
                ) return@launch
                viewModel.onDeselectTextElement()
                viewModel.onDeselectSticker()
                pass = if (sources.video != null) SceneCapturePass.OVERLAY_ONLY else SceneCapturePass.FULL
                val frame = captureFrame(layer)
                pass = SceneCapturePass.NONE
                if (frame == null) toast(context, failed) else exportViewModel.export(entry.destination, sources, frame)
            }
        },
    )
}

/** Laisse à la scène le temps de se repeindre dans la passe (forme, fond, calques), puis lit ce qu'elle a enregistré. */
private suspend fun CoroutineScope.captureFrame(layer: GraphicsLayer): Bitmap? {
    repeat(CAPTURE_SETTLE_FRAMES) { withFrameNanos { } }
    return runCatching { layer.toImageBitmap().asAndroidBitmap().copy(Bitmap.Config.ARGB_8888, false) }.getOrNull()
}

private const val CAPTURE_SETTLE_FRAMES = 3

private fun toast(context: Context, text: String) = Toast.makeText(context, text, Toast.LENGTH_SHORT).show()

/** Le voile du bake : une fenêtre qui prend le geste et le retour système (annuler) — on ne modifie pas la scène qu'on grave. */
@Composable
private fun ExportProgressDialog(fraction: Float?, onCancel: () -> Unit) {
    if (fraction == null) return
    Dialog(
        onDismissRequest = onCancel,
        properties = DialogProperties(dismissOnClickOutside = false, usePlatformDefaultWidth = false),
    ) {
        ComposerExportProgressVeil(fraction = fraction, onCancel = onCancel, modifier = Modifier.fillMaxSize())
    }
}

/** Remet le MP4 baké à la feuille de partage système, par le `FileProvider` de l'application. */
private fun shareScene(context: Context, file: File, chooserTitle: String) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val send = Intent(Intent.ACTION_SEND)
        .setType("video/mp4")
        .putExtra(Intent.EXTRA_STREAM, uri)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(
        Intent.createChooser(send, chooserTitle)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION),
    )
}
