package me.meeshy.app.stories

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerFormatLabel
import me.meeshy.sdk.model.composer.ComposerMediaSource
import me.meeshy.sdk.model.composer.ComposerRailSize
import me.meeshy.sdk.model.composer.ComposerRailSizing
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

internal val SCENE_TARGET = ComposerRailSizing.MIN_TARGET_DP.dp

/** La taille des boutons ronds de l'écran (#14499) : posée par le cadre du compositeur depuis sa largeur et sa hauteur utile. */
internal val LocalComposerRailSize = compositionLocalOf { ComposerRailSizing.REGULAR }

/** L'espace entre deux cibles d'un rail, selon la taille de l'écran. */
internal val ComposerRailSize.gap get() = gapDp.dp
private val SCENE_VEIL = Color.Black.copy(alpha = 0.38f)
internal val SOCLE_VEIL = Color.Black.copy(alpha = 0.45f)

/**
 * Un bouton rond posé sur la scène (#13834) : un disque translucide de 40 dp dans une cible de 48 dp, nommé pour TalkBack.
 * Il consomme ses propres touchers et rien d'autre : hors du disque, la scène garde ses gestes. [press] : son appui long.
 * [value] : ce que l'option porte déjà (le texte du post, #14457) — un point discret le montre, TalkBack le lit.
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
    value: String? = null,
) {
    val carried = value?.takeIf { it.isNotBlank() }
    Box(
        modifier = modifier
            .size(SCENE_TARGET)
            .clip(CircleShape)
            .toolPress(onClick, enabled, press)
            .semantics {
                contentDescription = label
                selected = active
                if (!enabled) disabled()
                if (carried != null) stateDescription = carried
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(LocalComposerRailSize.current.discDp.dp)
                .background(if (active) ComposerPlateauInk.accent.copy(alpha = 0.55f) else SCENE_VEIL, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.alpha(if (enabled) 1f else 0.4f))
        }
        if (carried != null) CarriedDot(Modifier.align(Alignment.TopEnd).offset(x = -CARRIED_DOT_INSET, y = CARRIED_DOT_INSET))
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
        EditingChromeVisibility(showsClose) { SceneRoundButton(MeeshyIcons.Close, stringResource(SceneChromeName.CLOSE.label), onClose) }
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
    if (history.canUndo) SceneRoundButton(MeeshyIcons.Undo, stringResource(SceneChromeName.UNDO.label), onUndo)
    if (history.canRedo) SceneRoundButton(MeeshyIcons.Redo, stringResource(SceneChromeName.REDO.label), onRedo)
}

internal const val SCENE_TOOL_COLUMN_TAG = "composer-scene-tool-column"

/** Le nom du conteneur, celui qu'iOS lui donne (`ComposerRestChromeCopy.column`, #15863) : « Outils de la scène ». */
internal val SCENE_TOOL_COLUMN_LABEL: Int get() = R.string.composer_rest_column

/**
 * La colonne des outils, posée à droite de la scène : chaque outil un bouton rond, le « ⋯ » rendu par [more], et l'appui
 * long de Média qui propose ses sources ([onMediaSource], #13845), la caméra de la scène en tête quand elle est servie ([cameraServed], #13849). Quand un panneau monte et lui laisse moins de place, elle
 * défile au lieu d'écraser ses cibles de 48 dp. « Texte du post » y porte [postText] (#14457).
 */
@Composable
internal fun SceneToolColumn(
    tools: List<ComposerSceneTool>,
    onTool: (ComposerSceneTool) -> Unit,
    more: @Composable () -> Unit,
    active: ComposerSceneTool? = null,
    onMediaSource: (ComposerMediaSource) -> Unit = {},
    cameraServed: Boolean = false,
    postText: String = "",
) {
    // Le « ⋯ » reste TOUJOURS posé au pied de la colonne (#14282, recette S8) : quand la colonne n'a plus la place de tout
    // montrer, le dernier bouton passait hors champ sans que rien ne dise qu'on pouvait défiler. Ce sont les outils au-dessus
    // de lui qui défilent. « Texte du post » se pose avec lui (#14457) : l'option propre au format ne se cache jamais
    // derrière un défilement.
    val foot = tools.filter { it == ComposerSceneTool.POST_TEXT }
    val button: @Composable (ComposerSceneTool) -> Unit = { tool ->
        MediaSourcesAnchor(ComposerSceneTools.longPressSources(tool, cameraServed), onMediaSource) { press ->
            SceneRoundButton(
                tool.glyph(), tool.label(), { onTool(tool) }, active = tool == active, press = press,
                value = postText.takeIf { tool == ComposerSceneTool.POST_TEXT },
            )
        }
    }
    val gap = LocalComposerRailSize.current.gap
    val name = stringResource(SCENE_TOOL_COLUMN_LABEL)
    Column(
        modifier = Modifier.testTag(SCENE_TOOL_COLUMN_TAG).semantics { contentDescription = name; isTraversalGroup = true },
        verticalArrangement = Arrangement.spacedBy(gap),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier.weight(1f, fill = false).composerScrollEdgeCue(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(gap),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            (tools - foot - ComposerSceneTool.MORE).forEach { button(it) }
        }
        foot.forEach { button(it) }
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
                .heightIn(min = SCENE_TARGET)
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(if (canPublish) Brush.linearGradient(MeeshyPalette.BrandGradient) else SolidColor(SOCLE_VEIL)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = SCENE_TARGET)
                    .clickable(enabled = canPublish, role = Role.Button, onClick = onPublish)
                    .semantics { contentDescription = publishLabel }
                    .padding(start = MeeshySpacing.lg, end = MeeshySpacing.xs),
                contentAlignment = Alignment.CenterStart,
            ) {
                PublishOneLineLabel(
                    full = publishLabel,
                    short = stringResource(R.string.composer_socle_publish),
                    color = Color.White.copy(alpha = if (canPublish) 1f else 0.6f),
                )
            }
            chevron?.invoke()
        }
    }
}

/**
 * Le libellé de Publier tient sur UNE ligne (#14826) : le nom entier s'il tient, puis le nom entier en plus petit, puis
 * « Publier », puis « Publier » en plus petit, puis la flèche seule quand même ce mot ne tient pas (comme iOS aux tailles
 * d'accessibilité) — jamais un mot coupé, jamais une seconde ligne. Le bouton garde le nom entier pour le lecteur d'écran.
 */
private val PUBLISH_ARROW = 20.dp

@Composable
private fun PublishOneLineLabel(full: String, short: String, color: Color) {
    val measurer = rememberTextMeasurer()
    val regular = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold)
    val reduced = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
    BoxWithConstraints {
        val room = constraints.maxWidth
        val fitting = remember(full, short, room, regular, reduced) {
            listOf(full to regular, full to reduced, short to regular, short to reduced)
                .firstOrNull { (text, style) -> measurer.measure(text, style, maxLines = 1, softWrap = false).size.width <= room }
        }
        if (fitting == null) {
            Icon(MeeshyIcons.ArrowUp, contentDescription = null, tint = color, modifier = Modifier.size(PUBLISH_ARROW))
        } else {
            Text(text = fitting.first, color = color, style = fitting.second, maxLines = 1, softWrap = false)
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
    ComposerSceneTool.POST_TEXT -> MeeshyIcons.Notes
    ComposerSceneTool.MORE -> MeeshyIcons.MoreHorizontal
}

/** Le nom qu'iOS donne à chaque outil (`ComposerRailCopy`, #15599) : TalkBack dit le VERBE, comme VoiceOver. */
internal fun ComposerSceneTool.labelRes(): Int? = when (this) {
    ComposerSceneTool.TEXT -> R.string.composer_rail_text
    ComposerSceneTool.MEDIA -> R.string.composer_rail_media
    ComposerSceneTool.STICKER -> R.string.composer_rail_sticker
    ComposerSceneTool.SOUND -> R.string.composer_rail_sound
    ComposerSceneTool.DRAWING -> R.string.stories_composer_draw
    ComposerSceneTool.BACKGROUND -> R.string.composer_rail_background
    ComposerSceneTool.MENTION -> R.string.composer_rail_mention
    ComposerSceneTool.PLACE -> R.string.composer_rail_place
    ComposerSceneTool.POST_TEXT -> null
    ComposerSceneTool.MORE -> R.string.stories_scene_overflow_menu
}

/** Le mot court qu'un rail libellé AFFICHE (`ComposerLabeledRailCopy.title` iOS) ; TalkBack garde la phrase de [labelRes]. */
internal fun ComposerSceneTool.railTitleRes(): Int? = when (this) {
    ComposerSceneTool.TEXT -> R.string.composer_rail_title_text
    ComposerSceneTool.MEDIA -> R.string.composer_rail_title_media
    ComposerSceneTool.STICKER -> R.string.composer_rail_title_sticker
    ComposerSceneTool.SOUND -> R.string.composer_rail_title_sound
    ComposerSceneTool.DRAWING -> R.string.composer_rail_title_drawing
    ComposerSceneTool.BACKGROUND -> R.string.composer_rail_title_background
    ComposerSceneTool.MENTION -> R.string.composer_rail_title_mention
    ComposerSceneTool.PLACE -> R.string.composer_rail_title_place
    ComposerSceneTool.POST_TEXT, ComposerSceneTool.MORE -> labelRes()
}

/** Les contrôles du haut de la scène et les titres des rails, aux noms d'iOS (#15599). */
internal enum class SceneChromeName(@StringRes val label: Int) {
    CLOSE(R.string.composer_scene_close),
    UNDO(R.string.composer_history_undo),
    REDO(R.string.composer_history_redo),
    RAIL_MORE(R.string.composer_rail_more),
    RAIL_SELECTION(R.string.composer_rail_selection),
}

/** Le nom d'un outil ; « Texte du post » se dit « Texte du réel » sur la scène d'un réel (#13913). */
@Composable
internal fun ComposerSceneTool.label(): String =
    labelRes()?.let { stringResource(it) } ?: formatLabel(ComposerFormatLabel.POST_TEXT)

/** Le mot qu'un rail libellé affiche pour l'outil. */
@Composable
internal fun ComposerSceneTool.railTitle(): String =
    railTitleRes()?.let { stringResource(it) } ?: formatLabel(ComposerFormatLabel.POST_TEXT)

/** Le point discret d'une option qui porte déjà quelque chose (#14457) : la couleur de la marque, 8 dp. */
@Composable
internal fun CarriedDot(modifier: Modifier = Modifier) {
    Box(modifier.size(CARRIED_DOT).background(ComposerPlateauInk.accent, CircleShape))
}

private val CARRIED_DOT = 8.dp

/** Le point reste dans le cercle de la cible, qui rogne ses coins. */
private val CARRIED_DOT_INSET = 6.dp
