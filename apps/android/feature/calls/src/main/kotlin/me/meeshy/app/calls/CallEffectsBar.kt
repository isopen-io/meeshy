package me.meeshy.app.calls

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.effects.CallEffectKind
import me.meeshy.sdk.model.call.effects.CallEffectLayer
import me.meeshy.sdk.model.call.effects.CallEffectLayers
import me.meeshy.sdk.model.call.effects.CallEffectsBarMode
import me.meeshy.sdk.model.call.effects.CallEffectsBarRule
import me.meeshy.sdk.model.call.effects.CallEffectsSettingsMotion
import me.meeshy.sdk.model.call.montage.CallMontageFrameRule
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

private val SIDE_DIAMETER = 48.dp

/**
 * LA barre de la famille « Effets, filtres, cadres » (loi 14, décision porteur du 2026-11-13, #16979) : Effets ET Montage
 * la prennent, c'est la même. Le verre de l'atome partagé (`CallControlsGlass`) porte les puces de tri et leur filet, puis
 * `‹ · Réglages · (+)`. Les réglages ou la liste des effets appliqués ouverts, les puces partent en fondu et la barre se
 * resserre sur sa rangée de base ; sous « Réduire les animations », le cadre se redimensionne en fondu court.
 */
@Composable
internal fun EffectsBar(
    chips: List<CallEffectKind>,
    selected: CallEffectKind?,
    bar: CallEffectsBarMode,
    layers: CallEffectLayers,
    reduceMotion: Boolean,
    onBack: () -> Unit,
    onSettings: () -> Unit,
    onAddLook: () -> Unit,
    onShowApplied: () -> Unit,
    onChip: (CallEffectKind) -> Unit,
    addsLook: Boolean = true,
    settingsHint: String = stringResource(R.string.call_effects_settings_hint),
) {
    val millis = CallEffectsSettingsMotion.durationMillis(reduceMotion)
    val resize = if (reduceMotion) Modifier.animateContentSize(tween(millis)) else Modifier
    CallControlsGlass(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg).then(resize)) {
        AnimatedVisibility(
            visible = CallEffectsBarRule.showsLooks(bar),
            enter = fadeIn(tween(millis)) + if (reduceMotion) EnterTransition.None else expandVertically(tween(millis)),
            exit = fadeOut(tween(millis)) + if (reduceMotion) ExitTransition.None else shrinkVertically(tween(millis)),
        ) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                KindPicker(chips, selected, onChip)
                CallPillHairline()
            }
        }
        EffectsBaseRow(bar, layers, addsLook, settingsHint, onBack, onSettings, onAddLook, onShowApplied)
    }
}

/**
 * P8b.6 — ce qui est posé AU-DESSUS de la barre : la bande de looks du mode, OU un panneau de verre (réglages, liste des
 * effets appliqués). La bande part en fondu, le panneau monte depuis la barre en fondu (≈ 200 ms, transformation +
 * opacité) et y redescend au retour ; « Réduire les animations » : fondu court seul, sans montée. Effets et Montage
 * la partagent.
 */
@Composable
internal fun EffectsBand(bar: CallEffectsBarMode, reduceMotion: Boolean, content: @Composable (CallEffectsBarMode) -> Unit) {
    val millis = CallEffectsSettingsMotion.durationMillis(reduceMotion)
    val rise = with(LocalDensity.current) { CallEffectsSettingsMotion.riseDp(reduceMotion).dp.roundToPx() }
    AnimatedContent(
        targetState = bar,
        transitionSpec = {
            val opens = targetState != CallEffectsBarMode.Base
            val enter = fadeIn(tween(millis)) + slideInVertically(tween(millis)) { if (opens) rise else 0 }
            val exit = fadeOut(tween(millis)) + slideOutVertically(tween(millis)) { if (opens) 0 else rise }
            (enter togetherWith exit).using(SizeTransform(clip = false) { _, _ -> tween(millis) })
        },
        contentAlignment = Alignment.BottomCenter,
        label = "effects-band",
    ) { shown -> content(shown) }
}

/**
 * La rangée de genres de la famille (Visage · Couleur · Cadres) : le genre montré est pressé (« Cadres » au Montage). En
 * grand texte, elle défile plutôt que de se couper, et ses bords s'effacent en fondu (iOS `CallEffectsGenreChips`).
 */
@Composable
private fun KindPicker(chips: List<CallEffectKind>, selected: CallEffectKind?, onSelect: (CallEffectKind) -> Unit) {
    val haptics = LocalHapticFeedback.current
    val scroll = rememberScrollState()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .callScrollEdgeFade(scroll, horizontal = true)
            .horizontalScroll(scroll)
            .padding(horizontal = MeeshySpacing.sm),
    ) {
        chips.forEachIndexed { index, kind ->
            if (index > 0) Text("·", color = CallPalette.InkSecondary, fontWeight = FontWeight.SemiBold)
            val isSelected = kind == selected
            Text(
                text = stringResource(effectKindLabel(kind)),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = if (isSelected) CallPalette.Ink else CallPalette.Ink.copy(alpha = 0.55f),
                modifier = Modifier
                    .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                    .clickable(role = Role.Tab) {
                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSelect(kind)
                    }
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.md)
                    .semantics { this.selected = isSelected },
            )
        }
    }
}

/**
 * ‹ Retour à l'appel · Réglages (disque blanc quand ils sont ouverts) · (+) (iOS `CallEffectsBar.baseRow`). [settingsHint]
 * dit ce que Réglages ouvre dans ce mode : Luminosité · Flou du fond en Effets, « Chaque visage » au Montage.
 */
@Composable
private fun EffectsBaseRow(
    bar: CallEffectsBarMode,
    layers: CallEffectLayers,
    addsLook: Boolean,
    settingsHint: String,
    onBack: () -> Unit,
    onSettings: () -> Unit,
    onAddLook: () -> Unit,
    onShowApplied: () -> Unit,
) {
    val showsSettings = bar == CallEffectsBarMode.Settings
    Row(
        Modifier.fillMaxWidth().padding(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        CallPillButton(
            icon = MeeshyIcons.Back,
            kind = CallPillKind.Normal,
            label = stringResource(R.string.call_effects_back),
            hint = stringResource(R.string.call_effects_back_hint),
            diameter = SIDE_DIAMETER,
            onClick = onBack,
        )
        CallPillButton(
            icon = MeeshyIcons.SettingsFilled,
            kind = if (showsSettings) CallPillKind.Active else CallPillKind.Normal,
            label = stringResource(R.string.call_effects_settings),
            caption = stringResource(R.string.call_effects_settings),
            hint = settingsHint,
            toggleState = showsSettings,
            diameter = SIDE_DIAMETER,
            onClick = onSettings,
        )
        EffectsAddButton(layers, addsLook, onAddLook, onShowApplied)
    }
}

/**
 * (+) : un toucher ouvre un genre absent de la pile ; l'appui long (0,45 s, celui d'iOS) liste les effets appliqués, et
 * le lecteur d'écran, qui n'a pas d'appui long, a la même liste par une action nommée. Pile pleine, (+) n'ajoute plus,
 * le dit à son étiquette et garde son appui long. [addsLook] faux (un genre qu'aucun mode n'offre ici) : (+) se lit
 * indisponible mais garde, lui aussi, son appui long.
 */
@Composable
private fun EffectsAddButton(layers: CallEffectLayers, addsLook: Boolean, onAddLook: () -> Unit, onShowApplied: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    val appliedTitle = stringResource(R.string.call_effects_applied_title)
    val showApplied = {
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        onShowApplied()
    }
    val hasLayers = !layers.isEmpty
    val actions = remember(hasLayers, appliedTitle, onShowApplied) {
        if (hasLayers) listOf(CustomAccessibilityAction(appliedTitle) { onShowApplied(); true }) else emptyList()
    }
    val base = LocalViewConfiguration.current
    val pressDelay = remember(base) { CaptureViewConfiguration(base) }
    CompositionLocalProvider(LocalViewConfiguration provides pressDelay) {
        CallPillButton(
            icon = MeeshyIcons.Add,
            kind = CallPillKind.Normal,
            label = stringResource(if (layers.isFull) R.string.call_effects_add_look_full else R.string.call_effects_add_look),
            hint = stringResource(if (layers.isFull) R.string.call_effects_add_look_full_hint else R.string.call_effects_add_look_hint),
            diameter = SIDE_DIAMETER,
            onClick = { if (!layers.isFull && addsLook) onAddLook() },
            onLongClick = showApplied.takeIf { hasLayers },
            customActions = actions,
            dimmed = layers.isFull || !addsLook,
        )
    }
}

/**
 * La liste des effets appliqués (appui long sur (+)) : un verre SÉPARÉ posé au-dessus de la barre, comme le panneau des
 * réglages, de la couche du dessus à celle du dessous, chacune avec de quoi l'annuler. Annuler en retire UNE seule, les
 * autres gardent leur ordre ; la liste se referme alors et la barre revient à son menu de base (c'est l'hôte qui le fait).
 */
@Composable
internal fun EffectsAppliedPanel(layers: CallEffectLayers, onRemove: (CallEffectKind) -> Unit) {
    val title = stringResource(R.string.call_effects_applied_title)
    val language = LocalConfiguration.current.locales[0]?.language
    CallControlsGlass(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg)) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
                .semantics { paneTitle = title },
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = CallPalette.Ink,
                modifier = Modifier.semantics { heading() },
            )
            layers.listed.forEach { layer -> AppliedRow(layer, language, onRemove) }
        }
    }
}

@Composable
private fun AppliedRow(layer: CallEffectLayer, language: String?, onRemove: (CallEffectKind) -> Unit) {
    val entry = effectLayerEntry(layer, language)
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = entry,
            style = MaterialTheme.typography.bodyLarge,
            color = CallPalette.Ink,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = { onRemove(layer.kind) }, modifier = Modifier.heightIn(min = 48.dp)) {
            Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.call_effects_layer_undo, entry), tint = Color.White)
        }
    }
}

/** « Visage · Crapaud », « Cadre · Signature » : le genre et le nom du choix, dans la langue de l'appareil (iOS `layerTitle`). */
@Composable
internal fun effectLayerEntry(layer: CallEffectLayer, language: String?): String {
    val kind = stringResource(layerKindLabel(layer.kind))
    val name = when (layer.kind) {
        CallEffectKind.Face -> CallFaceEffect.entries.firstOrNull { it.id == layer.choice }?.let { stringResource(faceLabel(it)) }
        CallEffectKind.Color -> VideoFilterPreset.fromId(layer.choice)?.let { stringResource(presetLabel(it)) }
        CallEffectKind.Frame -> CallMontageFrameRule.frameName(layer.choice, language = language)
        CallEffectKind.Landscape, CallEffectKind.Voice -> null
    } ?: layer.choice
    return stringResource(R.string.call_effects_layer_entry, kind, name)
}

/** Le genre d'UNE couche : « Cadre » (le mot de l'option « Cadre »), comme iOS `layerKindName` ; les puces disent « Cadres ». */
private fun layerKindLabel(kind: CallEffectKind): Int =
    if (kind == CallEffectKind.Frame) R.string.call_live_frame_caption else effectKindLabel(kind)

internal fun effectKindLabel(kind: CallEffectKind): Int = when (kind) {
    CallEffectKind.Face -> R.string.call_effects_category_face
    CallEffectKind.Color -> R.string.call_effects_category_color
    CallEffectKind.Frame -> R.string.call_effects_category_frame
    CallEffectKind.Landscape -> R.string.call_effects_category_landscape
    CallEffectKind.Voice -> R.string.call_effects_category_voice
}
