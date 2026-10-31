package me.meeshy.app.stories

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.widget.Toast
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.sdk.model.scene.export.ImagerLengthChoice
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/** L'export vidéo vu du lecteur : [start] lance Enregistrer, Partager ou Imager ; [busy] fige la lecture tant qu'il dure. */
@Stable
internal class StoryVideoExport(val busy: Boolean, private val launch: (StoryExportMode) -> Unit) {
    fun start(mode: StoryExportMode) = launch(mode)
}

/**
 * [item] rend la story telle que la passerelle l'a servie (ses objets sonores, ses fenêtres), [slide] sa projection —
 * celle que le lecteur peint. Le choix de longueur, la peinture des calques et le voile du bake vivent ici.
 */
@Composable
internal fun rememberStoryVideoExport(item: () -> StoryItem?, slide: StorySlideView?): StoryVideoExport {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val viewModel: StoryVideoExportViewModel = hiltViewModel()
    val exportState by viewModel.state.collectAsStateWithLifecycle()
    val stage by viewModel.stage.collectAsStateWithLifecycle()
    val failed = stringResource(R.string.stories_scene_export_failed)
    val saved = stringResource(R.string.stories_scene_export_saved)
    val shareTitle = stringResource(R.string.stories_viewer_export_share)
    val currentItem by rememberUpdatedState(item)
    val currentSlide by rememberUpdatedState(slide)

    LaunchedEffect(exportState) {
        when (val export = exportState) {
            SceneExportState.Saved -> toast(context, saved).also { viewModel.acknowledge() }
            SceneExportState.Failed -> toast(context, failed).also { viewModel.acknowledge() }
            is SceneExportState.Ready -> {
                shareVideo(context, File(export.path), shareTitle)
                viewModel.handedOver()
            }
            else -> Unit
        }
    }
    when (val current = stage) {
        is StoryVideoExportStage.ChoosingLength -> ImagerLengthDialog(current.choices, onChoose = viewModel::chooseLength)
        else -> StoryVideoExportVeil(
            fraction = exportState.veilFraction,
            painting = (current as? StoryVideoExportStage.Painting)?.request,
            onPainted = viewModel::painted,
            onCancel = viewModel::cancel,
        )
    }
    val permissions = rememberPermissionFlow()
    PermissionFlowHost(permissions)

    return StoryVideoExport(busy = exportState.isExporting || stage != StoryVideoExportStage.Idle) { mode ->
        scope.launch {
            val story = currentItem() ?: return@launch
            val shown = currentSlide ?: return@launch
            // Android 8–9 : la photothèque s'écrit sous WRITE_EXTERNAL_STORAGE, demandé par la porte unique ; dès l'API 29, rien.
            if (mode != StoryExportMode.SHARE && !permissions.ensure(PermissionNature.PHOTO_LIBRARY_ADD)) return@launch
            viewModel.export(mode, story, shown)
        }
    }
}

/** Au-delà d'une minute, Imager propose la longueur rendue depuis le début : chaque quart avec sa durée. */
@Composable
internal fun ImagerLengthDialog(choices: List<ImagerLengthChoice>, onChoose: (ImagerQuarter?) -> Unit) {
    AlertDialog(
        onDismissRequest = { onChoose(null) },
        title = { Text(stringResource(R.string.stories_export_length_title)) },
        text = {
            Column {
                Text(
                    text = stringResource(R.string.stories_export_length_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyPalette.White.copy(alpha = SUBTITLE_ALPHA),
                )
                choices.forEach { choice ->
                    Text(
                        text = stringResource(
                            R.string.stories_export_length_option,
                            choice.quarter.numerator,
                            StoryVideoExportStages.clock(choice.durationMillis),
                        ),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MeeshyPalette.White,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(role = Role.Button) { onChoose(choice.quarter) }
                            .padding(vertical = MeeshySpacing.md),
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = { onChoose(null) }) { Text(stringResource(R.string.stories_cancel)) }
        },
    )
}

/** Le voile du bake : il prend le geste et le retour système (annuler), et porte, invisible dessous, la scène qu'on peint. */
@Composable
private fun StoryVideoExportVeil(
    fraction: Float?,
    painting: StoryExportPaintRequest?,
    onPainted: (List<File>?) -> Unit,
    onCancel: () -> Unit,
) {
    if (fraction == null) return
    Dialog(
        onDismissRequest = onCancel,
        properties = DialogProperties(dismissOnClickOutside = false, usePlatformDefaultWidth = false),
    ) {
        Box(Modifier.fillMaxSize()) {
            if (painting != null) StoryExportPainter(painting, onPainted)
            ComposerExportProgressVeil(fraction = fraction, onCancel = onCancel, modifier = Modifier.fillMaxSize())
        }
    }
}

/**
 * Peint la slide à chaque instant demandé, à la taille de la vidéo : le contenu s'enregistre dans un calque graphique
 * sans jamais se dessiner à l'écran. Le fond n'y entre que lorsqu'aucune vidéo ne le porte ; les vidéos posées s'y
 * montrent à leur affiche.
 */
@Composable
private fun StoryExportPainter(request: StoryExportPaintRequest, onPainted: (List<File>?) -> Unit) {
    val density = LocalDensity.current
    val layer = rememberGraphicsLayer()
    val progress = remember(request) { Animatable(0f) }
    var imageReady by remember(request) { mutableStateOf(!request.withBackground || request.slide.imageUrl == null) }
    val durationMs = request.durationMillis.coerceIn(1L, Int.MAX_VALUE.toLong()).toInt()
    val width = with(density) { request.format.width.toDp() }
    val height = with(density) { request.format.height.toDp() }

    Box(
        Modifier
            .requiredSize(width, height)
            .drawWithContent { layer.record { this@drawWithContent.drawContent() } },
    ) {
        if (request.withBackground) {
            Box(Modifier.fillMaxSize().background(hexColor(request.slide.accentHex)))
            StorySceneBackground(
                slide = request.slide,
                playing = false,
                muted = true,
                stillFrame = true,
                onImageResolved = { imageReady = true },
            )
        }
        StorySceneOverlays(
            slide = request.slide,
            progress = progress,
            slideDurationMs = durationMs,
            playing = false,
            muted = true,
            players = false,
        )
    }
    LaunchedEffect(request) {
        val files = try {
            withTimeoutOrNull(IMAGE_WAIT_MILLIS) { snapshotFlow { imageReady }.first { it } }
            delay(WARM_UP_MILLIS)
            request.frames.mapIndexed { index, frame ->
                progress.snapTo((frame.startMillis.toFloat() / durationMs).coerceIn(0f, 1f))
                repeat(SETTLE_FRAMES) { withFrameNanos { } }
                writeLayer(layer, request, File(request.directory, "calque-$index.png"))
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            null
        }
        onPainted(files)
    }
}

private suspend fun writeLayer(layer: GraphicsLayer, request: StoryExportPaintRequest, target: File): File {
    val captured = layer.toImageBitmap().asAndroidBitmap().copy(Bitmap.Config.ARGB_8888, false)
    return withContext(Dispatchers.IO) {
        val sized = if (captured.width == request.format.width && captured.height == request.format.height) captured
        else Bitmap.createScaledBitmap(captured, request.format.width, request.format.height, true)
        try {
            target.outputStream().use { sized.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, it) }
        } finally {
            if (sized !== captured) sized.recycle()
            captured.recycle()
        }
        target
    }
}

private const val IMAGE_WAIT_MILLIS = 5_000L
private const val WARM_UP_MILLIS = 600L
private const val SETTLE_FRAMES = 3
private const val PNG_QUALITY = 100
private const val SUBTITLE_ALPHA = 0.7f

private fun toast(context: Context, text: String) = Toast.makeText(context, text, Toast.LENGTH_SHORT).show()

/** Remet le MP4 à la feuille de partage système, par le `FileProvider` de l'application. */
private fun shareVideo(context: Context, file: File, chooserTitle: String) {
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

/** Les trois sorties vidéo du menu ⋮, offertes sur toute story comme iOS « Exporter en vidéo ». */
@Composable
internal fun StoryVideoExportMenuEntries(onPick: (StoryExportMode) -> Unit) {
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
        leadingIcon = { Icon(MeeshyIcons.Movie, contentDescription = null) },
        onClick = { onPick(StoryExportMode.IMAGER) },
    )
}
