package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerMediaSource
import me.meeshy.sdk.model.composer.ComposerSceneTool
import me.meeshy.sdk.model.composer.ComposerSceneTools
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** L'historique de la scène tel que la barre du haut le montre : absent sans historique (loi 4). */
internal data class SceneHistory(val canUndo: Boolean, val canRedo: Boolean)

/** La pastille d'audience : le libellé du mode (« Public ») et son glyphe. */
internal data class SceneAudience(val label: String, val icon: ImageVector)

internal val SCENE_TARGET = 48.dp
private val SCENE_DISC = 40.dp
private val SCENE_VEIL = Color.Black.copy(alpha = 0.38f)
internal val SOCLE_VEIL = Color.Black.copy(alpha = 0.45f)

/**
 * Un bouton rond posé sur la scène (#13834) : un disque translucide de 40 dp dans une cible de 48 dp, nommé pour TalkBack.
 * Il consomme ses propres touchers et rien d'autre : hors du disque, la scène garde ses gestes. [press] : son appui long.
 */
@Composable
internal fun SceneRoundButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    active: Boolean = false,
    press: ToolLongPress? = null,
) {
    Box(
        modifier = modifier
            .size(SCENE_TARGET)
            .clip(CircleShape)
            .toolPress(onClick, enabled, press)
            .semantics {
                contentDescription = label
                selected = active
                if (!enabled) disabled()
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(SCENE_DISC)
                .background(if (active) ComposerPlateauInk.accent.copy(alpha = 0.55f) else SCENE_VEIL, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.alpha(if (enabled) 1f else 0.4f))
        }
    }
}

/**
 * Le haut de la scène : ✕ à gauche, ↶ ↷ à droite seulement avec un historique. [keepsHeight] : la barre garde sa hauteur
 * quand ✕ se retire pour l'édition d'un objet (#13956), sans quoi la colonne remonterait d'un cran.
 */
@Composable
internal fun SceneTopBar(
    onClose: () -> Unit,
    history: SceneHistory?,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    showsClose: Boolean = true,
    keepsHeight: Boolean = false,
) {
    Row(
        modifier = Modifier.fillMaxWidth().then(if (keepsHeight) Modifier.heightIn(min = SCENE_TARGET) else Modifier),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EditingChromeVisibility(showsClose) { SceneRoundButton(MeeshyIcons.Close, stringResource(R.string.composer_scene_close), onClose) }
        Spacer(Modifier.weight(1f))
        history?.let { SceneHistoryButtons(it, onUndo, onRedo) }
    }
}

/**
 * ↶ et ↷ (#14209, décision porteur du 2026-11-01) : un bouton sans pas à annuler ou à rétablir est MASQUÉ, jamais grisé,
 * et réapparaît dès qu'il a un pas à rejouer.
 */
@Composable
internal fun SceneHistoryButtons(history: SceneHistory, onUndo: () -> Unit, onRedo: () -> Unit) {
    if (history.canUndo) SceneRoundButton(MeeshyIcons.Undo, stringResource(R.string.story_composer_undo), onUndo)
    if (history.canRedo) SceneRoundButton(MeeshyIcons.Redo, stringResource(R.string.story_composer_redo), onRedo)
}

/**
 * La colonne des outils, posée à droite de la scène : chaque outil un bouton rond, le « ⋯ » rendu par [more], et l'appui
 * long de Média qui propose ses sources ([onMediaSource], #13845), la caméra de la scène en tête quand elle est servie ([cameraServed], #13849). Quand un panneau monte et lui laisse moins de place, elle
 * défile au lieu d'écraser ses cibles de 48 dp.
 */
@Composable
internal fun SceneToolColumn(
    tools: List<ComposerSceneTool>,
    onTool: (ComposerSceneTool) -> Unit,
    more: @Composable () -> Unit,
    active: ComposerSceneTool? = null,
    onMediaSource: (ComposerMediaSource) -> Unit = {},
    cameraServed: Boolean = false,
) {
    // Le « ⋯ » reste TOUJOURS posé au pied de la colonne (#14282, recette S8) : en post, « Texte du post » prend une rangée
    // au socle, la colonne n'a plus la place de tout montrer, et le dernier bouton passait hors champ sans que rien ne dise
    // qu'on pouvait défiler. Ce sont les outils au-dessus de lui qui défilent.
    Column(
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            tools.filterNot { it == ComposerSceneTool.MORE }.forEach { tool ->
                MediaSourcesAnchor(ComposerSceneTools.longPressSources(tool, cameraServed), onMediaSource) { press ->
                    SceneRoundButton(tool.glyph(), stringResource(tool.labelRes()), { onTool(tool) }, active = tool == active, press = press)
                }
            }
        }
        if (ComposerSceneTool.MORE in tools) more()
    }
}

/**
 * Le socle posé au bas de la scène : la pastille d'audience, puis Publier qui prend le reste de la largeur. Le corps
 * publie ; le [chevron] — le menu « Publier comme » de l'hôte — ferme le bouton, et n'existe pas en route autonome.
 */
@Composable
internal fun ScenePublishSocle(
    audience: SceneAudience,
    onAudience: () -> Unit,
    publishLabel: String,
    canPublish: Boolean,
    onPublish: () -> Unit,
    chevron: (@Composable () -> Unit)?,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AudiencePastille(audience, onAudience)
        Row(
            modifier = Modifier
                .weight(1f)
                .height(SCENE_TARGET)
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(if (canPublish) Brush.linearGradient(MeeshyPalette.BrandGradient) else SolidColor(SOCLE_VEIL)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clickable(enabled = canPublish, role = Role.Button, onClick = onPublish)
                    .semantics { contentDescription = publishLabel }
                    .padding(start = MeeshySpacing.lg, end = MeeshySpacing.xs),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    text = publishLabel,
                    color = Color.White.copy(alpha = if (canPublish) 1f else 0.6f),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            chevron?.invoke()
        }
    }
}

@Composable
private fun AudiencePastille(audience: SceneAudience, onClick: () -> Unit) {
    val name = stringResource(R.string.composer_socle_audience)
    Row(
        modifier = Modifier
            .height(SCENE_TARGET)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(SOCLE_VEIL)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = name
                role = Role.Button
            }
            .padding(horizontal = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(audience.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
        Text(audience.label, style = MaterialTheme.typography.labelLarge, color = Color.White, maxLines = 1)
    }
}

internal fun ComposerSceneTool.glyph(): ImageVector = when (this) {
    ComposerSceneTool.TEXT -> MeeshyIcons.TextFields
    ComposerSceneTool.MEDIA -> MeeshyIcons.PhotoFilled
    ComposerSceneTool.STICKER -> MeeshyIcons.EmojiFilled
    ComposerSceneTool.SOUND -> MeeshyIcons.MusicNote
    ComposerSceneTool.DRAWING -> MeeshyIcons.Scribble
    ComposerSceneTool.BACKGROUND -> MeeshyIcons.Palette
    ComposerSceneTool.MENTION -> MeeshyIcons.Mention
    ComposerSceneTool.PLACE -> MeeshyIcons.Location
    ComposerSceneTool.MORE -> MeeshyIcons.MoreHorizontal
}

internal fun ComposerSceneTool.labelRes(): Int = when (this) {
    ComposerSceneTool.TEXT -> R.string.story_tool_text
    ComposerSceneTool.MEDIA -> R.string.story_tool_media
    ComposerSceneTool.STICKER -> R.string.stories_composer_add_sticker
    ComposerSceneTool.SOUND -> R.string.story_tool_audio
    ComposerSceneTool.DRAWING -> R.string.story_tool_drawing
    ComposerSceneTool.BACKGROUND -> R.string.story_tool_texture
    ComposerSceneTool.MENTION -> R.string.composer_more_mention
    ComposerSceneTool.PLACE -> R.string.story_place_title
    ComposerSceneTool.MORE -> R.string.stories_scene_overflow_menu
}
