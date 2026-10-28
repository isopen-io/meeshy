package me.meeshy.ui.component.audio.editor

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.File
import java.util.Locale
import kotlinx.coroutines.launch
import me.meeshy.sdk.audioedit.AudioEditResult
import me.meeshy.sdk.audioedit.AudioEditorController
import me.meeshy.sdk.model.audioedit.AudioEditorPlaybackLaw
import me.meeshy.sdk.model.audioedit.AudioEditorTool
import me.meeshy.sdk.model.audioedit.selection
import me.meeshy.sdk.model.format.LocalizedNumber
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'éditeur audio plein écran, UNIQUE — miroir de `MeeshyAudioEditorView` (iOS) : forme d'onde interactive,
 * bascule Simple / Pro, bande d'outils dont le panneau n'apparaît que quand il sert, journal des versions avec
 * annuler / rétablir, et un seul bouton du bas. Les modifications sont cuites dans le fichier rendu à
 * [onConfirm] : le rognage vaut donc toujours 0 → durée finale.
 *
 * Plein écran ⇒ croix en haut à gauche, retour système ET glissé vers le bas pour fermer. Le décodage de la
 * forme d'onde ([loadLevels], hors du fil principal, mis en cache et borné par le dépôt de formes d'onde), le
 * lecteur (libéré en quittant, focus audio) et le rendu d'une version (annulé en quittant) ne bloquent jamais le
 * geste. Les fichiers temporaires de la session sont effacés à la sortie, quelle qu'elle soit.
 */
@Composable
fun MeeshyAudioEditorScreen(
    controller: AudioEditorController,
    loadLevels: suspend (File) -> List<Float>,
    outputDirectory: File,
    onConfirm: (AudioEditResult) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = MeeshyPalette.Indigo500,
) {
    val tokens = LocalMeeshyTokens.current
    val state by controller.state.collectAsState()
    val scope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val staging = state.staging
    val duration = state.duration
    val player = rememberAudioEditorPlayer { controller.state.value.let { it.staging.previewRegion(it.duration) } }
    var levels by remember { mutableStateOf<List<Float>>(emptyList()) }
    val activeVersionId = state.document?.active?.id

    LaunchedEffect(controller) { controller.prepare() }
    DisposableEffect(controller) { onDispose { controller.abandon() } }
    LaunchedEffect(activeVersionId) {
        val file = controller.activeFile ?: return@LaunchedEffect
        player.load(file)
        levels = runCatching { loadLevels(file) }.getOrDefault(emptyList())
    }
    LaunchedEffect(staging.previewRate, player.isPlaying) { if (player.isPlaying) player.setRate(staging.previewRate) }

    val cancel: () -> Unit = {
        player.release()
        scope.launch {
            controller.discard()
            onCancel()
        }
    }
    val confirm: () -> Unit = {
        player.release()
        scope.launch {
            val result = runCatching { controller.confirm(outputDirectory) }.getOrNull()
            if (result != null) onConfirm(result) else onCancel()
        }
    }
    BackHandler(onBack = cancel)
    val currentCancel by rememberUpdatedState(cancel)
    val swipe = remember { SwipeDownToDismiss { currentCancel() } }
    val thresholdPx = with(LocalDensity.current) { DISMISS_DP.dp.toPx() }
    swipe.thresholdPx = thresholdPx

    Box(
        modifier
            .fillMaxSize()
            .background(tokens.backgroundPrimary)
            .background(brush = MeeshyGradients.brandLight, alpha = BACKDROP_ALPHA)
            .nestedScroll(swipe),
    ) {
        when {
            state.preparing -> PreparingState(Modifier.fillMaxSize())
            state.document == null -> UnreadableState(cancel)
            else -> BoxWithConstraints(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                Column(
                    Modifier
                        .verticalScroll(rememberScrollState())
                        .heightIn(min = maxHeight)
                        .padding(horizontal = MeeshySpacing.lg),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    EditorHeader(controller, cancel)
                    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
                        WaveformSection(controller, player, levels, accent)
                        Transport(player, duration, staging) { haptics.light() }
                    }
                    EditorDock(controller, accent, confirm)
                }
            }
        }
        AnimatedVisibility(state.processing) { AudioEditorProcessingOverlay(Modifier.fillMaxSize()) }
    }
}

@Composable
private fun EditorHeader(controller: AudioEditorController, onClose: () -> Unit) {
    val state by controller.state.collectAsState()
    Row(
        Modifier.fillMaxWidth().padding(top = MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        CircleButton(MeeshyIcons.Close, stringResource(R.string.audio_editor_close), onClick = onClose)
        if (state.document?.hasHistory == true) {
            CircleButton(MeeshyIcons.Undo, stringResource(R.string.audio_editor_undo), state.canUndo) { controller.undo() }
            CircleButton(MeeshyIcons.Redo, stringResource(R.string.audio_editor_redo), state.canRedo) { controller.redo() }
        }
        Spacer(Modifier.weight(1f))
        ModeSwitcher(state.staging.mode) { controller.setMode(it) }
    }
}

@Composable
private fun WaveformSection(controller: AudioEditorController, player: AudioEditorPlayer, levels: List<Float>, accent: Color) {
    val tokens = LocalMeeshyTokens.current
    val state by controller.state.collectAsState()
    val duration = state.duration
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Box(Modifier.fillMaxWidth().height(WAVEFORM_HEIGHT.dp)) {
            AudioEditorWaveform(
                levels = levels,
                progress = { AudioEditorPlaybackLaw.progress(player.position, duration) },
                selection = { controller.state.value.let { it.staging.selection(it.duration) } },
                accent = accent,
                onScrub = { player.seek(it * duration) },
                onScrubEnded = {},
                onSelectionStart = { f -> controller.update { it.withSelectionStart(f, duration) } },
                onSelectionEnd = { f -> controller.update { it.withSelectionEnd(f, duration) } },
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            ElapsedLabel(player, duration, accent)
            Text(clock(duration), color = tokens.textMuted, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
        }
    }
}

/** Le temps écoulé : seul ce nœud se recompose à chaque image de lecture. */
@Composable
private fun ElapsedLabel(player: AudioEditorPlayer, duration: Double, accent: Color) {
    Text(
        clock(minOf(player.position, duration)),
        color = accent,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        fontFamily = FontFamily.Monospace,
    )
}

@Composable
private fun Transport(
    player: AudioEditorPlayer,
    duration: Double,
    staging: me.meeshy.sdk.model.audioedit.AudioEditorStaging,
    onTap: () -> Unit,
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        SkipButton(MeeshyIcons.Replay5, -AudioEditorPlaybackLaw.SKIP_SECONDS, player, duration, onTap)
        Spacer(Modifier.size(34.dp))
        Box(
            Modifier
                .size(60.dp)
                .clip(CircleShape)
                .background(MeeshyGradients.brand)
                .clickable(role = Role.Button) { onTap(); player.toggle(staging.previewRegion(duration), staging.previewRate) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (player.isPlaying) MeeshyIcons.Pause else MeeshyIcons.Play,
                stringResource(if (player.isPlaying) R.string.audio_editor_pause else R.string.audio_editor_play),
                Modifier.size(28.dp),
                tint = Color.White,
            )
        }
        Spacer(Modifier.size(34.dp))
        SkipButton(MeeshyIcons.Forward5, AudioEditorPlaybackLaw.SKIP_SECONDS, player, duration, onTap)
    }
}

@Composable
private fun SkipButton(icon: androidx.compose.ui.graphics.vector.ImageVector, delta: Double, player: AudioEditorPlayer, duration: Double, onTap: () -> Unit) {
    val tokens = LocalMeeshyTokens.current
    Box(
        Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Button) {
            onTap()
            player.seek(AudioEditorPlaybackLaw.skipped(player.position, delta, duration))
        },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, Modifier.size(24.dp), tint = tokens.textPrimary.copy(alpha = 0.65f))
    }
}

@Composable
private fun EditorDock(controller: AudioEditorController, accent: Color, onConfirm: () -> Unit) {
    val state by controller.state.collectAsState()
    val staging = state.staging
    val document = state.document ?: return
    val tools = staging.availableTools.filter { it != AudioEditorTool.TRANSCRIBE }
    Column(Modifier.padding(top = MeeshySpacing.lg, bottom = MeeshySpacing.xl), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        state.error?.let { AudioEditorErrorBanner(it) { controller.selectTool(staging.tool) } }
        staging.tool?.takeIf { it in tools }?.let { tool ->
            AudioEditorToolPanel(
                tool = tool,
                staging = staging,
                duration = state.duration,
                accent = accent,
                onChange = { controller.update(it) },
            )
        }
        if (document.hasHistory) {
            AudioEditorHistoryStrip(document, accent, enabled = !state.processing, onSelect = { controller.selectVersion(it) })
        }
        AudioEditorToolStrip(tools, staging.tool, accent) { controller.selectTool(it) }
        AudioEditorBottomButton(state.canApply, !state.processing) { if (state.canApply) controller.apply() else onConfirm() }
    }
}

@Composable
private fun PreparingState(modifier: Modifier) {
    val tokens = LocalMeeshyTokens.current
    Column(modifier, verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(color = MeeshyPalette.Indigo500)
        Spacer(Modifier.height(MeeshySpacing.lg))
        Text(stringResource(R.string.audio_editor_preparing), color = tokens.textMuted, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun UnreadableState(onClose: () -> Unit) {
    val tokens = LocalMeeshyTokens.current
    Column(
        Modifier.fillMaxSize().statusBarsPadding().padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(Modifier.fillMaxWidth()) { CircleButton(MeeshyIcons.Close, stringResource(R.string.audio_editor_close), onClick = onClose) }
        Spacer(Modifier.weight(1f))
        Text(stringResource(R.string.audio_editor_error_load), color = tokens.textSecondary, fontSize = 14.sp)
        Spacer(Modifier.weight(1f))
    }
}

/** Le glissé vers le bas qui ferme l'écran : il ne compte que ce que le contenu n'a pas consommé. */
private class SwipeDownToDismiss(private val onDismiss: () -> Unit) : NestedScrollConnection {
    var thresholdPx: Float = Float.MAX_VALUE
    private var pulled = 0f

    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
        pulled = if (available.y > 0f) pulled + available.y else 0f
        return Offset.Zero
    }

    override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
        val dismiss = pulled >= thresholdPx
        pulled = 0f
        if (dismiss) onDismiss()
        return Velocity.Zero
    }
}

private fun clock(seconds: Double): String = LocalizedNumber.duration(seconds, locale = Locale.getDefault())

private const val WAVEFORM_HEIGHT = 96
private const val DISMISS_DP = 120
private const val BACKDROP_ALPHA = 0.06f
