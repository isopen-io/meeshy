package me.meeshy.ui.component.imageedit

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.sdk.model.imageedit.EditorTool
import me.meeshy.sdk.model.imageedit.ImageEditorMode
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

internal fun EditorTool.icon(): ImageVector = when (this) {
    EditorTool.CROP -> MeeshyIcons.Crop
    EditorTool.FILTERS -> MeeshyIcons.PhotoFilter
    EditorTool.ADJUST -> MeeshyIcons.Tune
    EditorTool.EFFECTS -> MeeshyIcons.Sparkles
}

@Composable
internal fun EditorTool.label(): String = stringResource(
    when (this) {
        EditorTool.CROP -> R.string.image_editor_tool_crop
        EditorTool.FILTERS -> R.string.image_editor_tool_filters
        EditorTool.ADJUST -> R.string.image_editor_tool_adjust
        EditorTool.EFFECTS -> R.string.image_editor_tool_effects
    },
)

/** Le sens et le ressort d'entrée du panneau : ressort 0,36 / 0,86, ou un fondu seul si « Réduire les animations ». */
private fun <T> panelSpring(): SpringSpec<T> =
    spring(dampingRatio = 0.86f, stiffness = MeeshyMotion.stiffnessForResponse(0.36f))

/** Barre haute : fermer, capsule Simple/Pro, Terminé. Posée sous la marge sûre de la fenêtre. */
@Composable
internal fun ImageEditorTopBar(
    mode: ImageEditorMode,
    accent: Color,
    onCancel: () -> Unit,
    onMode: (ImageEditorMode) -> Unit,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.mdPlus).padding(top = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GlassCircleButton(MeeshyIcons.Close, stringResource(R.string.image_editor_cancel), 48.dp, accent, "image-editor-cancel", onClick = onCancel)
        Spacer(Modifier.weight(1f))
        ImageEditorModeSwitcher(mode = mode, isDark = MeeshyTheme.isDark, onSelect = onMode)
        Spacer(Modifier.weight(1f))
        DoneButton(onDone)
    }
}

@Composable
private fun DoneButton(onClick: () -> Unit) {
    val label = stringResource(R.string.image_editor_done)
    Row(
        Modifier
            .heightFor48()
            .shadow(6.dp, CircleShape)
            .clip(CircleShape)
            .background(MeeshyGradients.brand)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg)
            .semantics(mergeDescendants = true) { contentDescription = label }
            .testTag("image-editor-done"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
        Text(label, color = Color.White, style = meeshyText(MeeshyFontSize.body, FontWeight.Bold))
    }
}

private fun Modifier.heightFor48(): Modifier = this.height(48.dp)

@Composable
internal fun GlassCircleButton(
    icon: ImageVector,
    label: String,
    size: androidx.compose.ui.unit.Dp,
    accent: Color,
    tag: String,
    enabled: Boolean = true,
    active: Boolean = false,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(size)
            .alpha(if (enabled) 1f else 0.5f)
            .shadow(6.dp, CircleShape)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label; if (!enabled) disabled() }
            .testTag(tag),
        contentAlignment = Alignment.Center,
    ) {
        if (active) {
            Box(Modifier.size(size).background(MeeshyGradients.brand, CircleShape))
        } else {
            MeeshyGlassSurface(Modifier.size(size), shape = CircleShape, tint = accent) {}
            Box(Modifier.size(size).border(BorderStroke(1.dp, accent.copy(alpha = 0.35f)), CircleShape))
        }
        Icon(
            icon,
            contentDescription = null,
            tint = if (active) Color.White else if (enabled) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(size * 0.4f),
        )
    }
}

/** La grappe d'outils en bas à gauche — masquée quand un contrôleur est ouvert. */
@Composable
internal fun ImageEditorToolFabs(
    visible: Boolean,
    mode: ImageEditorMode,
    accent: Color,
    onTool: (EditorTool) -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduce = LocalReduceMotion.current
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = if (reduce) fadeIn() else slideInHorizontally(MeeshyMotion.springDefault()) { -it } + fadeIn(),
        exit = if (reduce) fadeOut() else slideOutHorizontally { -it } + fadeOut(),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            EditorTool.rail(mode).forEach { tool ->
                GlassCircleButton(tool.icon(), tool.label(), 54.dp, accent, "image-editor-fab-${tool.name}", onClick = { onTool(tool) })
            }
        }
    }
}

/** Historique, rétablir, annuler — en bas à droite, masqués avec les outils ; l'historique n'apparaît qu'avec une retouche (0,2 s). */
@Composable
internal fun ImageEditorHistoryFabs(
    visible: Boolean,
    hasEdits: Boolean,
    canUndo: Boolean,
    canRedo: Boolean,
    accent: Color,
    onHistory: () -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduce = LocalReduceMotion.current
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = if (reduce) fadeIn() else slideInHorizontally(MeeshyMotion.springDefault()) { it } + fadeIn(),
        exit = if (reduce) fadeOut() else slideOutHorizontally { it } + fadeOut(),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus), horizontalAlignment = Alignment.End) {
            AnimatedVisibility(visible = hasEdits, enter = fadeIn(tween(200)), exit = fadeOut(tween(200))) {
                GlassCircleButton(MeeshyIcons.History, stringResource(R.string.image_editor_history), 48.dp, accent, "image-editor-fab-history", onClick = onHistory)
            }
            GlassCircleButton(MeeshyIcons.Redo, stringResource(R.string.image_editor_redo), 48.dp, accent, "image-editor-fab-redo", enabled = canRedo, onClick = onRedo)
            GlassCircleButton(MeeshyIcons.Undo, stringResource(R.string.image_editor_undo), 48.dp, accent, "image-editor-fab-undo", enabled = canUndo, onClick = onUndo)
        }
    }
}

/**
 * Le contrôleur : poignée à tirer vers le bas, sélecteur d'outil, annuler/rétablir/fermer, puis le
 * panneau de l'outil. Il glisse depuis le bas en ressort 0,36 / 0,86.
 */
@Composable
internal fun ImageEditorController(
    tool: EditorTool?,
    mode: ImageEditorMode,
    canUndo: Boolean,
    canRedo: Boolean,
    accent: Color,
    onTool: (EditorTool) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable (EditorTool) -> Unit,
) {
    val reduce = LocalReduceMotion.current
    var drag by remember { mutableFloatStateOf(0f) }
    AnimatedVisibility(
        visible = tool != null,
        modifier = modifier,
        enter = if (reduce) fadeIn() else slideInVertically(panelSpring()) { it } + fadeIn(),
        exit = if (reduce) fadeOut() else slideOutVertically { it } + fadeOut(),
    ) {
        val shape = RoundedCornerShape(MeeshyRadius.xxl)
        Column(
            Modifier
                .widthIn(max = 620.dp)
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.sm)
                .padding(bottom = MeeshySpacing.sm)
                .offset { IntOffset(0, drag.coerceAtLeast(0f).roundToInt()) }
                .clip(shape)
                .background(MeeshyTheme.tokens.backgroundSecondary.copy(alpha = 0.92f))
                .border(BorderStroke(0.5.dp, accent.copy(alpha = 0.18f)), shape)
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.mdPlus)
                .testTag("image-editor-controller"),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(22.dp)
                    .pointerInput(Unit) {
                        detectVerticalDragGestures(
                            onVerticalDrag = { _, amount -> drag += amount },
                            onDragEnd = { if (drag > 70.dp.toPx()) onClose(); drag = 0f },
                            onDragCancel = { drag = 0f },
                        )
                    },
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(40.dp, 5.dp).clip(CircleShape).background(MeeshyTheme.tokens.textMuted.copy(alpha = 0.6f)))
            }
            tool?.let { active ->
                ControllerHeader(active, mode, canUndo, canRedo, accent, onTool, onUndo, onRedo, onClose)
                content(active)
            }
        }
    }
}

@Composable
private fun ControllerHeader(
    active: EditorTool,
    mode: ImageEditorMode,
    canUndo: Boolean,
    canRedo: Boolean,
    accent: Color,
    onTool: (EditorTool) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onClose: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        EditorTool.rail(mode).forEach { candidate ->
            val isActive = candidate == active
            val name = candidate.label()
            Box(
                Modifier
                    .size(48.dp, 48.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .then(if (isActive) Modifier.background(MeeshyGradients.brand) else Modifier.background(MeeshyTheme.tokens.inputBackground))
                    .clickable(role = Role.Tab) { if (!isActive) onTool(candidate) }
                    .semantics { contentDescription = name; selected = isActive }
                    .testTag("image-editor-chip-${candidate.name}"),
                contentAlignment = Alignment.Center,
            ) {
                Icon(candidate.icon(), null, tint = if (isActive) Color.White else MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(20.dp))
            }
        }
        Spacer(Modifier.weight(1f))
        HeaderIcon(MeeshyIcons.Undo, stringResource(R.string.image_editor_undo), canUndo, onUndo)
        HeaderIcon(MeeshyIcons.Redo, stringResource(R.string.image_editor_redo), canRedo, onRedo)
        HeaderIcon(MeeshyIcons.Close, stringResource(R.string.image_editor_close), true, onClose)
    }
}

@Composable
private fun HeaderIcon(icon: ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label; if (!enabled) disabled() },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(34.dp).background(MeeshyTheme.tokens.inputBackground.copy(alpha = if (enabled) 1f else 0.5f), CircleShape), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = if (enabled) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textMuted, modifier = Modifier.size(16.dp))
        }
    }
}
