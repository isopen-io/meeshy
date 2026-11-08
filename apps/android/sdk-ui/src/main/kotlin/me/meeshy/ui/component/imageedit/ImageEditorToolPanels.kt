package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.imageedit.AdjustmentKind
import me.meeshy.sdk.model.imageedit.CropRatio
import me.meeshy.sdk.model.imageedit.ImageAdjustments
import me.meeshy.sdk.model.imageedit.ImageEditorFormat
import me.meeshy.sdk.model.imageedit.ImageEditorMode
import me.meeshy.sdk.model.imageedit.ImageEffect
import me.meeshy.sdk.model.imageedit.ImageFilter
import me.meeshy.ui.R
import me.meeshy.ui.icons.ImageEditorIcons
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

internal fun imageFilterLabel(filter: ImageFilter): Int = when (filter) {
    ImageFilter.ORIGINAL -> R.string.image_editor_filter_original
    ImageFilter.VIVID -> R.string.image_editor_filter_vivid
    ImageFilter.DRAMATIC -> R.string.image_editor_filter_dramatic
    ImageFilter.MONO -> R.string.image_editor_filter_mono
    ImageFilter.NOIR -> R.string.image_editor_filter_noir
    ImageFilter.SEPIA -> R.string.image_editor_filter_sepia
    ImageFilter.WARM -> R.string.image_editor_filter_warm
    ImageFilter.COOL -> R.string.image_editor_filter_cool
    ImageFilter.FADE -> R.string.image_editor_filter_fade
    ImageFilter.CHROME -> R.string.image_editor_filter_chrome
    ImageFilter.PROCESS -> R.string.image_editor_filter_process
    ImageFilter.INSTANT -> R.string.image_editor_filter_instant
}

internal fun imageEffectLabel(effect: ImageEffect): Int = when (effect) {
    ImageEffect.NONE -> R.string.image_editor_effect_none
    ImageEffect.BLUR -> R.string.image_editor_effect_blur
    ImageEffect.VIGNETTE -> R.string.image_editor_effect_vignette
    ImageEffect.SHARPEN -> R.string.image_editor_effect_sharpen
    ImageEffect.BLOOM -> R.string.image_editor_effect_bloom
    ImageEffect.GRAIN -> R.string.image_editor_effect_grain
}

internal fun adjustmentLabel(kind: AdjustmentKind): Int = when (kind) {
    AdjustmentKind.EXPOSURE -> R.string.image_editor_adjust_exposure
    AdjustmentKind.BRIGHTNESS -> R.string.image_editor_adjust_brightness
    AdjustmentKind.CONTRAST -> R.string.image_editor_adjust_contrast
    AdjustmentKind.SATURATION -> R.string.image_editor_adjust_saturation
    AdjustmentKind.VIBRANCE -> R.string.image_editor_adjust_vibrance
    AdjustmentKind.TEMPERATURE -> R.string.image_editor_adjust_temperature
    AdjustmentKind.SHARPNESS -> R.string.image_editor_adjust_sharpness
    AdjustmentKind.BLUR -> R.string.image_editor_adjust_blur
    AdjustmentKind.VIGNETTE -> R.string.image_editor_adjust_vignette
    AdjustmentKind.BLOOM -> R.string.image_editor_effect_bloom
    AdjustmentKind.GRAIN -> R.string.image_editor_effect_grain
}

/** Panneau Filtres : une rangée défilante de vignettes d'aperçu, une par filtre du mode. */
@Composable
internal fun ImageEditorFiltersPanel(
    mode: ImageEditorMode,
    selected: ImageFilter,
    thumbnails: Map<ImageFilter, Bitmap>,
    accent: Color,
    onSelect: (ImageFilter) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = MeeshySpacing.xxs, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        ImageFilter.rail(mode).forEach { filter ->
            val isSelected = filter == selected
            val name = stringResource(imageFilterLabel(filter))
            Column(
                Modifier
                    .clickable(role = Role.Button) { onSelect(filter) }
                    .semantics(mergeDescendants = true) { contentDescription = name; this.selected = isSelected },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                val shape = RoundedCornerShape(MeeshyRadius.sm)
                Box(
                    Modifier
                        .size(64.dp)
                        .clip(shape)
                        .background(MeeshyTheme.tokens.inputBackground)
                        .border(BorderStroke(if (isSelected) 2.dp else 0.dp, if (isSelected) accent else Color.Transparent), shape),
                ) {
                    thumbnails[filter]?.let {
                        Image(it.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(64.dp))
                    }
                }
                Text(
                    name,
                    color = if (isSelected) accent else MeeshyTheme.tokens.textSecondary,
                    style = meeshyText(MeeshyFontSize.caption, if (isSelected) FontWeight.Bold else FontWeight.Medium),
                )
            }
        }
    }
}

/** Panneau Ajuster : une rangée par réglage (curseur + valeur formatée) et « Réinitialiser » dès qu'un réglage est actif. */
@Composable
internal fun ImageEditorAdjustPanel(
    mode: ImageEditorMode,
    adjustments: ImageAdjustments,
    accent: Color,
    onChange: (AdjustmentKind, Float) -> Unit,
    onCommit: (AdjustmentKind) -> Unit,
    onReset: () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().heightIn(max = 230.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        ImageEditorFormat.toneRail(mode).forEach { kind ->
            AdjustRow(kind, adjustments, accent, onChange, onCommit)
        }
        if (adjustments.activeCount > 0) {
            Text(
                stringResource(R.string.image_editor_reset),
                color = accent,
                style = meeshyText(MeeshyFontSize.small, FontWeight.SemiBold),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .clickable(role = Role.Button, onClick = onReset)
                    .padding(vertical = MeeshySpacing.md),
            )
        }
    }
}

@Composable
private fun AdjustRow(
    kind: AdjustmentKind,
    adjustments: ImageAdjustments,
    accent: Color,
    onChange: (AdjustmentKind, Float) -> Unit,
    onCommit: (AdjustmentKind) -> Unit,
) {
    val value = adjustments[kind]
    val name = stringResource(adjustmentLabel(kind))
    val shown = ImageEditorFormat.adjustment(value, kind)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        Text(
            name,
            color = if (adjustments.isActive(kind)) accent else MeeshyTheme.tokens.textSecondary,
            style = meeshyText(MeeshyFontSize.small, FontWeight.Medium),
            modifier = Modifier.width(88.dp),
        )
        Slider(
            value = value,
            onValueChange = { onChange(kind, it) },
            onValueChangeFinished = { onCommit(kind) },
            valueRange = kind.min..kind.max,
            colors = SliderDefaults.colors(thumbColor = accent, activeTrackColor = accent),
            modifier = Modifier
                .weight(1f)
                .semantics { contentDescription = name; stateDescription = shown },
        )
        Text(
            shown,
            color = MeeshyTheme.tokens.textMuted,
            style = meeshyText(MeeshyFontSize.caption, FontWeight.SemiBold),
            modifier = Modifier.width(34.dp),
        )
    }
}

/** Panneau Effets (Pro) : une grille de trois colonnes ; retoucher l'effet actif le retire. */
@Composable
internal fun ImageEditorEffectsPanel(selected: ImageEffect, accent: Color, onToggle: (ImageEffect) -> Unit) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        modifier = Modifier.fillMaxWidth().heightIn(max = 200.dp),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        contentPadding = PaddingValues(bottom = MeeshySpacing.xsPlus),
    ) {
        items(ImageEffect.entries.toList(), key = { it.name }) { effect ->
            val isSelected = effect == selected
            val name = stringResource(imageEffectLabel(effect))
            val shape = RoundedCornerShape(MeeshyRadius.smPlus)
            Box(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .clip(shape)
                    .background(if (isSelected) accent.copy(alpha = 0.14f) else MeeshyTheme.tokens.inputBackground)
                    .border(BorderStroke(if (isSelected) 1.5.dp else 0.dp, if (isSelected) accent else Color.Transparent), shape)
                    .clickable(role = Role.Button) { onToggle(effect) }
                    .semantics(mergeDescendants = true) { contentDescription = name; this.selected = isSelected },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    name,
                    color = if (isSelected) accent else MeeshyTheme.tokens.textSecondary,
                    style = meeshyText(MeeshyFontSize.caption, FontWeight.SemiBold),
                )
            }
        }
    }
}

/** Panneau Recadrer : chips de ratio, pivots (et miroirs en Pro) et l'indication de glissement. */
@Composable
internal fun ImageEditorCropPanel(
    mode: ImageEditorMode,
    ratio: CropRatio,
    accent: Color,
    onRatio: (CropRatio) -> Unit,
    onRotate: (clockwise: Boolean) -> Unit,
    onFlip: (horizontal: Boolean) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        ) {
            CropRatio.available(mode.isPro).forEach { candidate ->
                val isSelected = candidate == ratio
                val text = candidate.label ?: stringResource(R.string.image_editor_ratio_free)
                Box(
                    Modifier
                        .heightIn(min = 48.dp)
                        .clip(CircleShape)
                        .then(if (isSelected) Modifier.background(MeeshyGradients.brand) else Modifier.background(MeeshyTheme.tokens.inputBackground))
                        .clickable(role = Role.Button) { onRatio(candidate) }
                        .padding(horizontal = MeeshySpacing.lg)
                        .semantics(mergeDescendants = true) { contentDescription = text; this.selected = isSelected },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text,
                        color = if (isSelected) Color.White else MeeshyTheme.tokens.textSecondary,
                        style = meeshyText(MeeshyFontSize.subhead, if (isSelected) FontWeight.Bold else FontWeight.Medium),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
            GeometryButton(ImageEditorIcons.RotateLeft, stringResource(R.string.image_editor_rotate_left), Modifier.weight(1f)) { onRotate(false) }
            GeometryButton(ImageEditorIcons.RotateRight, stringResource(R.string.image_editor_rotate_right), Modifier.weight(1f)) { onRotate(true) }
            if (mode.isPro) {
                GeometryButton(MeeshyIcons.SwapHorizontal, stringResource(R.string.image_editor_flip_h), Modifier.weight(1f)) { onFlip(true) }
                GeometryButton(MeeshyIcons.SwapVertical, stringResource(R.string.image_editor_flip_v), Modifier.weight(1f)) { onFlip(false) }
            }
        }
        Text(
            stringResource(R.string.image_editor_crop_hint),
            color = MeeshyTheme.tokens.textMuted,
            style = meeshyText(MeeshyFontSize.footnote),
        )
    }
}

@Composable
private fun GeometryButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(MeeshyTheme.tokens.inputBackground)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textPrimary, modifier = Modifier.size(22.dp))
    }
}
