package me.meeshy.app.stories

import android.content.Context
import android.content.Intent
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.io.File
import kotlinx.coroutines.launch
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.composer.scene.SceneExportPlan
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.sdk.model.scene.export.StoryExportAuthorFacts
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.icons.MeeshyIcons

/** L'export vidéo vu du lecteur : [start] lance Enregistrer, Partager, ou ouvre la vue Imager ; [busy] fige la lecture tant qu'il dure. */
@Stable
class StoryVideoExport internal constructor(
    val busy: Boolean,
    private val launch: (StoryExportMode, List<Pair<StoryItem, StorySlideView>>?) -> Unit,
) {
    /** Rend les scènes que l'hôte lit au moment du geste. */
    fun start(mode: StoryExportMode) = launch(mode, null)

    /** Rend [scenes], choisies par le geste lui-même (le média d'une visionneuse). */
    fun start(mode: StoryExportMode, scenes: List<Pair<StoryItem, StorySlideView>>) = launch(mode, scenes)
}

/**
 * [item] rend la story telle que la passerelle l'a servie (ses objets sonores, ses fenêtres), [slide] sa projection —
 * celle que le lecteur peint. La vue Imager, la peinture des calques et le voile du bake vivent ici.
 */
@Composable
internal fun rememberStoryVideoExport(item: () -> StoryItem?, slide: StorySlideView?, author: () -> StoryExportAuthorFacts? = { null }): StoryVideoExport {
    val currentSlide by rememberUpdatedState(slide)
    return rememberSceneVideoExport(author = author) { listOfNotNull(item()?.let { story -> currentSlide?.let { story to it } }) }
}

/**
 * L'export d'une ou plusieurs scènes ([scenes], lues au moment du geste) : un post à scène ou un réel s'exporte entier, ses
 * scènes bout à bout, par le même moteur que la story (#13896). La vue Imager, la peinture et le voile vivent ici.
 * [key] sépare la course de cet hôte de celle d'un autre hôte du même écran : chacun remet ce qu'il a lancé, une fois.
 */
@Composable
fun rememberSceneVideoExport(
    key: String? = null,
    author: () -> StoryExportAuthorFacts? = { null },
    scenes: () -> List<Pair<StoryItem, StorySlideView>>,
): StoryVideoExport {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val viewModel: StoryVideoExportViewModel = hiltViewModel(key = key)
    val exportState by viewModel.state.collectAsStateWithLifecycle()
    val stage by viewModel.stage.collectAsStateWithLifecycle()
    val shareTitle = stringResource(R.string.stories_viewer_export_share)
    val currentScenes by rememberUpdatedState(scenes)
    val currentAuthor by rememberUpdatedState(author)
    var lastRun by remember { mutableStateOf<SceneExportRun?>(null) }
    val permissions = rememberPermissionFlow()

    fun run(mode: StoryExportMode, shown: List<Pair<StoryItem, StorySlideView>>, storyAuthor: StoryExportAuthorFacts?) {
        scope.launch {
            // Android 8–9 : la photothèque s'écrit sous WRITE_EXTERNAL_STORAGE, demandé par la porte unique ; dès l'API 29, rien.
            if (mode == StoryExportMode.SAVE && !permissions.ensure(PermissionNature.PHOTO_LIBRARY_ADD)) return@launch
            lastRun = SceneExportRun(mode, shown, storyAuthor)
            viewModel.export(mode, shown, storyAuthor)
        }
    }

    when (val current = stage) {
        // « Imager » ouvre SA VUE (#14326) : Enregistrer et Partager partent d'elle, jamais du menu.
        is StoryVideoExportStage.Imagining -> ImagerSheet(current.offer, lastRun?.scenes?.firstOrNull()?.second) { decision ->
            scope.launch {
                val toGallery = decision?.destination == SceneExportDestination.GALLERY
                if (toGallery && !permissions.ensure(PermissionNature.PHOTO_LIBRARY_ADD)) return@launch
                viewModel.decideImager(decision)
            }
        }
        else -> {
            val painting = (current as? StoryVideoExportStage.Painting)?.request
            SceneExportStatus(
                exportState = exportState,
                painting = painting?.let { request -> { StoryExportPainter(request, viewModel::painted) } },
                onCancel = viewModel::cancel,
                onRetry = { lastRun?.let { previous -> run(previous.mode, previous.scenes, previous.author) } },
                onAcknowledge = viewModel::acknowledge,
                onReady = { ready ->
                    shareVideo(context, File(ready.path), shareTitle)
                    viewModel.handedOver()
                },
            )
        }
    }
    PermissionFlowHost(permissions)

    return StoryVideoExport(busy = exportState.isExporting || stage != StoryVideoExportStage.Idle) { mode, chosen ->
        (chosen ?: currentScenes()).takeIf { it.isNotEmpty() }?.let { shown -> run(mode, shown, if (chosen == null) currentAuthor() else null) }
    }
}

/**
 * L'export vu de l'écran (#13897) : la progression tant qu'il tourne, puis son ISSUE, retenue avant que l'état ne soit
 * acquitté ([onAcknowledge] le ramène au repos) — un échec se dit toujours, jamais une bande qui disparaît sans un mot.
 * [onReady] remet le fichier prêt (feuille de partage).
 */
@Composable
internal fun SceneExportStatus(
    exportState: SceneExportState,
    painting: (@Composable () -> Unit)?,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
    onAcknowledge: () -> Unit,
    onReady: (SceneExportState.Ready) -> Unit,
) {
    var outcome by remember { mutableStateOf<SceneExportOutcome?>(null) }
    val shown = SceneExportOutcome.of(exportState) ?: outcome
    LaunchedEffect(exportState) {
        val export = exportState
        if (export is SceneExportState.Running) outcome = null
        SceneExportOutcome.of(export)?.let { outcome = it }
        when (export) {
            SceneExportState.Saved, SceneExportState.Failed -> onAcknowledge()
            is SceneExportState.Ready -> onReady(export)
            else -> Unit
        }
    }
    SceneExportBand(
        fraction = exportState.veilFraction,
        onCancel = onCancel,
        verifying = exportState.isVerifying,
        outcome = shown,
        onRetry = onRetry,
        onOutcomeShown = { outcome = null },
        painting = painting,
    )
}

/** Le dernier export lancé, que « Réessayer » relance tel quel : même sortie, mêmes scènes. */
private class SceneExportRun(val mode: StoryExportMode, val scenes: List<Pair<StoryItem, StorySlideView>>, val author: StoryExportAuthorFacts?)

/** Remet la vidéo, ou l'image d'une scène fixe, à la feuille de partage système, par le `FileProvider` de l'application. */
private fun shareVideo(context: Context, file: File, chooserTitle: String) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val send = Intent(Intent.ACTION_SEND)
        .setType(SceneExportPlan.mimeType(file.path))
        .putExtra(Intent.EXTRA_STREAM, uri)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(
        Intent.createChooser(send, chooserTitle)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION),
    )
}

/** Les trois sorties vidéo du menu ⋮, offertes sur toute story, tout post à scène et tout réel, comme iOS « Exporter en vidéo ». */
@Composable
fun StoryVideoExportMenuEntries(onPick: (StoryExportMode) -> Unit) {
    DropdownMenuItem(
        text = { Text(stringResource(R.string.stories_viewer_export_save)) },
        leadingIcon = { Icon(MeeshyIcons.Download, contentDescription = null) },
        onClick = { onPick(StoryExportMode.SAVE) },
    )
    DropdownMenuItem(
        text = { Text(stringResource(R.string.stories_viewer_export_share)) },
        leadingIcon = { Icon(MeeshyIcons.Share, contentDescription = null) },
        onClick = { onPick(StoryExportMode.SHARE) },
    )
    DropdownMenuItem(
        text = { Text(stringResource(R.string.stories_viewer_export_imager)) },
        leadingIcon = { Icon(MeeshyIcons.PhotoFilled, contentDescription = null) },
        onClick = { onPick(StoryExportMode.IMAGER) },
    )
}
