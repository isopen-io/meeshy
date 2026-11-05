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
import me.meeshy.sdk.model.composer.scene.SceneExportPlan
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.sdk.model.scene.export.StoryExportAuthorFacts
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.component.export.ExportAnnouncement
import me.meeshy.ui.component.export.rememberExportAnnouncer
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.icons.MeeshyIcons

@Stable
class StoryVideoExport internal constructor(
    val busy: Boolean,
    private val launch: (StoryExportMode, List<Pair<StoryItem, StorySlideView>>?, ((File?) -> Unit)?) -> Unit,
) {
    fun start(mode: StoryExportMode) = launch(mode, null, null)

    fun start(mode: StoryExportMode, scenes: List<Pair<StoryItem, StorySlideView>>) = launch(mode, scenes, null)

    fun renderCard(scenes: List<Pair<StoryItem, StorySlideView>>, onRendered: (File?) -> Unit) = launch(StoryExportMode.CARD, scenes, onRendered)
}

/**
 * [item] rend la story telle que la passerelle l'a servie (ses objets sonores, ses fenêtres), [slide] sa projection —
 * celle que le lecteur peint. La peinture des calques et le voile du bake vivent ici.
 */
@Composable
internal fun rememberStoryVideoExport(item: () -> StoryItem?, slide: StorySlideView?, author: () -> StoryExportAuthorFacts? = { null }): StoryVideoExport {
    val currentSlide by rememberUpdatedState(slide)
    return rememberSceneVideoExport(author = author) { listOfNotNull(item()?.let { story -> currentSlide?.let { story to it } }) }
}

/**
 * L'export d'une ou plusieurs scènes ([scenes], lues au moment du geste) : un post à scène ou un réel s'exporte entier, ses
 * scènes bout à bout, par le même moteur que la story (#13896). La peinture et le voile vivent ici ; la sortie CARD remet
 * son fichier à l'atelier de carte qui l'a demandé (#16393).
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

    fun run(mode: StoryExportMode, shown: List<Pair<StoryItem, StorySlideView>>, storyAuthor: StoryExportAuthorFacts?, onCard: ((File?) -> Unit)? = null) {
        scope.launch {
            // Android 8–9 : la photothèque s'écrit sous WRITE_EXTERNAL_STORAGE, demandé par la porte unique ; dès l'API 29, rien.
            if (mode == StoryExportMode.SAVE && !permissions.ensure(PermissionNature.PHOTO_LIBRARY_ADD)) return@launch
            lastRun = SceneExportRun(mode, shown, storyAuthor, onCard)
            viewModel.export(mode, shown, storyAuthor)
        }
    }

    val painting = (stage as? StoryVideoExportStage.Painting)?.request
    val card = lastRun?.onCard
    SceneExportStatus(
        exportState = exportState,
        painting = painting?.let { request -> { StoryExportPainter(request, viewModel::painted) } },
        onCancel = {
            viewModel.cancel()
            card?.invoke(null)
        },
        onRetry = { lastRun?.let { previous -> run(previous.mode, previous.scenes, previous.author, previous.onCard) } },
        onAcknowledge = {
            if (exportState == SceneExportState.Failed) card?.invoke(null)
            viewModel.acknowledge()
        },
        onReady = { ready ->
            if (card != null) card(File(ready.path)) else shareVideo(context, File(ready.path), shareTitle)
            viewModel.handedOver()
        },
        announcesReady = card == null,
    )
    PermissionFlowHost(permissions)

    return StoryVideoExport(busy = exportState.isExporting || stage != StoryVideoExportStage.Idle) { mode, chosen, onCard ->
        val shown = (chosen ?: currentScenes()).takeIf { it.isNotEmpty() }
        if (shown == null) onCard?.invoke(null) else run(mode, shown, if (chosen == null) currentAuthor() else null, onCard)
    }
}

/**
 * L'export vu de l'écran (#13897) : la progression tant qu'il tourne, puis son ISSUE, remise à l'annonceur de
 * l'application (#14557) avant que l'état ne soit acquitté ([onAcknowledge] le ramène au repos) — un échec se dit
 * toujours, jamais une bande qui disparaît sans un mot, et la fin se dit encore quand le compositeur s'est fermé.
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
    announcesReady: Boolean = true,
) {
    val announcer = rememberExportAnnouncer()
    val saved = stringResource(R.string.stories_scene_export_saved)
    val shared = stringResource(R.string.stories_scene_export_shared)
    val failed = stringResource(R.string.stories_scene_export_failed)
    val retry = stringResource(R.string.stories_viewer_retry)
    val currentRetry by rememberUpdatedState(onRetry)
    var announced by remember { mutableStateOf<ExportAnnouncement?>(null) }
    LaunchedEffect(exportState) {
        val export = exportState
        if (export is SceneExportState.Running) announced?.let(announcer::withdraw)
        SceneExportOutcome.of(export)?.takeUnless { it == SceneExportOutcome.SHARED && !announcesReady }?.let { outcome ->
            val announcement = when (outcome) {
                SceneExportOutcome.SAVED -> ExportAnnouncement(saved)
                SceneExportOutcome.SHARED -> ExportAnnouncement(shared)
                SceneExportOutcome.FAILED -> ExportAnnouncement(failed, failed = true, retryLabel = retry, onRetry = { currentRetry() })
            }
            announced = announcement
            announcer.announce(announcement)
        }
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
        painting = painting,
    )
}

/** Le dernier export lancé, que « Réessayer » relance tel quel : même sortie, mêmes scènes. */
private class SceneExportRun(
    val mode: StoryExportMode,
    val scenes: List<Pair<StoryItem, StorySlideView>>,
    val author: StoryExportAuthorFacts?,
    val onCard: ((File?) -> Unit)?,
)

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

@Composable
fun StoryVideoExportMenuEntries(onPick: (StoryExportMode) -> Unit, onImager: (() -> Unit)? = null) {
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
    if (onImager != null) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.stories_viewer_export_imager)) },
            leadingIcon = { Icon(MeeshyIcons.PhotoFilled, contentDescription = null) },
            onClick = onImager,
        )
    }
}
