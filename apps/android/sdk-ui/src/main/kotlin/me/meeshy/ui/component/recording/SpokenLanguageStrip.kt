package me.meeshy.ui.component.recording

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.recording.SpokenLanguageChip
import me.meeshy.sdk.model.recording.SpokenLanguageStripLaw
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La bande de langue parlée (iOS `AudioRecorderSheet.languageStrip`) : drapeau + nom natif, langues
 * courantes d'abord, la langue [selected] en accent. Elle étiquette la prise pour la transcription et le
 * Prisme. Une rangée défilante, jamais coupée : l'accent est celui du contexte, passé en paramètre.
 */
@Composable
public fun SpokenLanguageStrip(
    selected: String,
    onSelect: (String) -> Unit,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val stripLabel = stringResource(R.string.audio_recorder_spoken_language)
    LazyRow(
        modifier = modifier.semantics { contentDescription = stripLabel },
        contentPadding = PaddingValues(horizontal = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items(SpokenLanguageStripLaw.chips, key = { it.code }, contentType = { "language" }) { chip ->
            SpokenLanguageChipView(
                chip = chip,
                active = SpokenLanguageStripLaw.isActive(chip, selected),
                accent = accent,
                onClick = {
                    haptics.light()
                    onSelect(chip.code)
                },
            )
        }
    }
}

@Composable
private fun SpokenLanguageChipView(
    chip: SpokenLanguageChip,
    active: Boolean,
    accent: Color,
    onClick: () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    Row(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(if (active) accent else tokens.controlFill)
            .semantics { selected = active }
            .clickable(role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xsPlus),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(text = chip.flag, fontSize = 14.sp)
        Text(
            text = chip.nativeName,
            color = if (active) Color.White else tokens.textSecondary,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
