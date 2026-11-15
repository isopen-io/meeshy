package me.meeshy.ui.component.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Conteneur d'un groupe de rangées : dégradé de surface teinté et bordure de 1 dp teintée.
 * Les filets sont posés explicitement par l'appelant via [SettingsSeparator].
 */
@Composable
public fun SettingsCard(
    tint: Color,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val dark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(MeeshyRadius.xxl)
    Column(
        modifier = modifier
            .clip(shape)
            .background(MeeshyGradients.surfaceGradient(tint, dark), shape)
            .border(1.dp, MeeshyGradients.tintedBorder(tint, dark), shape),
        content = content,
    )
}
