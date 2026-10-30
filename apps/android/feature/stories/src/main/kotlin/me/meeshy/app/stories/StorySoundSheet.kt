package me.meeshy.app.stories

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.stories.R
import me.meeshy.sdk.audio.ComposerVoiceCapture
import me.meeshy.sdk.audio.MediaRecorderEngine
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.readMediaUploadItem
import me.meeshy.sdk.model.composer.sound.ComposerAudioRole
import me.meeshy.sdk.model.composer.sound.ComposerSoundRoles
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

private enum class StorySoundSheetPage { MAIN, LIBRARY }

/**
 * La feuille « Son de la story » (#13848, iOS `MeeshyComposerHost+Sound` + `AudioPostComposerView`) : les sons de la
 * diapo et leurs réglages (rôle, volume, langue, transcription, rognage, atténuation des vidéos), puis trois sources —
 * le micro, les fichiers, la bibliothèque. Elle réduit la scène au-dessus d'elle et se ferme par OK.
 */
@Composable
internal fun StorySoundSheet(
    state: StoryComposerUiState,
    composer: StoryComposerViewModel,
    onDone: () -> Unit,
    viewModel: StorySoundSheetViewModel = hiltViewModel(),
) {
    val sheet by viewModel.state.collectAsStateWithLifecycle()
    var page by rememberSaveable { mutableStateOf(StorySoundSheetPage.MAIN) }
    if (page == StorySoundSheetPage.LIBRARY) {
        SoundShelfSheet(
            onUse = { sound ->
                composer.onBorrowSound(sound)
                page = StorySoundSheetPage.MAIN
            },
            onDismiss = { page = StorySoundSheetPage.MAIN },
        )
        return
    }
    val recorder = rememberStorySoundRecorder(onTake = viewModel::onTake)
    val importFile = rememberStorySoundImport(onTake = viewModel::onTake, onFailed = viewModel::onImportFailed)
    Column(Modifier.fillMaxWidth()) {
        StorySoundSheetHeader(onDone = onDone)
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            StorySoundTracks(state, composer, suggestionsAround = viewModel::suggestionsAround)
            val take = sheet.take
            when {
                recorder.isRecording -> StorySoundRecordingCard(recorder)
                take != null -> StorySoundTakeCard(
                    sheet = sheet,
                    take = take,
                    automatic = ComposerSoundRoles.automatic(state.selectedSlideAudio),
                    viewModel = viewModel,
                    onAdd = { automatic -> viewModel.onAdd(automatic) { sound, role -> composer.onPlaceComposedSound(sound, role) } },
                )
                state.canBorrowSound -> StorySoundSources(
                    onRecord = recorder.request,
                    onFiles = importFile,
                    onLibrary = { page = StorySoundSheetPage.LIBRARY },
                )
                else -> SheetNotice(stringResource(state.soundCapRefusal))
            }
            if (recorder.denied) SheetNotice(stringResource(R.string.story_sound_sheet_mic_denied))
            sheet.failure?.let { SheetNotice(stringResource(it.message)) }
        }
    }
}

private val SoundSheetFailure.message: Int
    get() = when (this) {
        SoundSheetFailure.IMPORT -> R.string.story_sound_sheet_import_failed
        SoundSheetFailure.UPLOAD -> R.string.story_sound_sheet_upload_failed
    }

/** Le titre et OK — la feuille n'a rien à annuler : chaque réglage s'applique à la scène (et se défait par l'historique). */
@Composable
private fun StorySoundSheetHeader(onDone: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm).heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.story_sound_sheet_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        TextButton(onClick = onDone) { Text(stringResource(R.string.stories_audience_picker_done), fontWeight = FontWeight.SemiBold) }
    }
}

/** Les trois sources d'un son, à égalité : le micro, les fichiers, la bibliothèque. */
@Composable
private fun StorySoundSources(onRecord: () -> Unit, onFiles: () -> Unit, onLibrary: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SourceButton(MeeshyIcons.Mic, R.string.story_sound_sheet_source_record, onRecord, Modifier.weight(1f))
        SourceButton(MeeshyIcons.Folder, R.string.story_sound_sheet_source_files, onFiles, Modifier.weight(1f))
        SourceButton(MeeshyIcons.QueueMusic, R.string.story_sound_sheet_source_library, onLibrary, Modifier.weight(1f))
    }
}

@Composable
private fun SourceButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: Int, onClick: () -> Unit, modifier: Modifier) {
    OutlinedButton(onClick = onClick, modifier = modifier.heightIn(min = 56.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null)
            Text(stringResource(label), style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
    }
}

@Composable
internal fun SheetNotice(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** L'enregistrement en cours : sa durée, Arrêter. */
@Composable
private fun StorySoundRecordingCard(recorder: StorySoundRecorder) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(MeeshyIcons.Mic, contentDescription = null, tint = MaterialTheme.colorScheme.error)
        Text(
            stringResource(R.string.story_sound_sheet_recording, clockOf(recorder.elapsedSeconds)),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f).padding(horizontal = MeeshySpacing.sm),
        )
        IconButton(onClick = recorder.stop) {
            Icon(MeeshyIcons.StopCircle, contentDescription = stringResource(R.string.story_sound_sheet_stop))
        }
    }
}

private fun clockOf(seconds: Double): String {
    val whole = seconds.toInt().coerceAtLeast(0)
    return "%d:%02d".format(whole / 60, whole % 60)
}

/** Le micro de la feuille : il vit avec elle et ne lui survit jamais (quitter la feuille jette la prise en cours). */
internal class StorySoundRecorder(
    val isRecording: Boolean,
    val elapsedSeconds: Double,
    val denied: Boolean,
    val request: () -> Unit,
    val stop: () -> Unit,
)

@Composable
private fun rememberStorySoundRecorder(onTake: (MediaUploadItem, Float?) -> Unit): StorySoundRecorder {
    val context = LocalContext.current
    val capture = remember { ComposerVoiceCapture(File(context.cacheDir, RECORDINGS), { MediaRecorderEngine(context) }) }
    var session by remember { mutableStateOf(capture.session) }
    var denied by remember { mutableStateOf(false) }
    val deliver by rememberUpdatedState(onTake)
    fun start() {
        denied = false
        capture.start()
        session = capture.session
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) start() else denied = true
    }
    DisposableEffect(capture) { onDispose { capture.cancel() } }
    LaunchedEffect(session.isRecording) {
        while (session.isRecording) {
            delay(TICK_MS)
            capture.tick(TICK_MS / 1000.0)
            session = capture.session
        }
    }
    return StorySoundRecorder(
        isRecording = session.isRecording,
        elapsedSeconds = session.elapsedSeconds,
        denied = denied,
        request = { if (context.hasMic()) start() else permission.launch(Manifest.permission.RECORD_AUDIO) },
        stop = {
            val take = capture.finish()
            session = capture.session
            take?.let { deliver(MediaUploadItem.onDisk(it.file, it.file.name, RECORDED_MIME, (it.durationSeconds * 1000).toLong()), it.durationSeconds.toFloat()) }
        },
    )
}

private fun Context.hasMic(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

/** « Fichiers » : un son choisi par le sélecteur du système, copié dans le cache privé avant d'être préparé. */
@Composable
private fun rememberStorySoundImport(onTake: (MediaUploadItem, Float?) -> Unit, onFailed: () -> Unit): () -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val take by rememberUpdatedState(onTake)
    val failed by rememberUpdatedState(onFailed)
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            val item = withContext(Dispatchers.IO) { context.readMediaUploadItem(uri) }
            if (item == null || !item.mimeType.startsWith("audio/")) {
                item?.let(me.meeshy.sdk.media.MediaIntake::release)
                failed()
            } else {
                take(item, item.durationMs?.let { it / 1000f })
            }
        }
    }
    return { picker.launch(arrayOf("audio/*")) }
}

/** Le compositeur pose le son que la feuille a préparé — une étape d'historique, comme tout geste de la scène. */
internal fun StoryComposerViewModel.onPlaceComposedSound(sound: ComposedStorySound, role: ComposerAudioRole) =
    onSceneReduce { state -> state.withDeckTransform { it.placeComposedSoundOnSelected(sound, role) } }

private const val RECORDINGS = "story-sounds"
private const val RECORDED_MIME = "audio/mp4"
private const val TICK_MS = 100L
