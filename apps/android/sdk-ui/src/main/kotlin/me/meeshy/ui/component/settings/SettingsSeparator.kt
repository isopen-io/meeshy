package me.meeshy.ui.component.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp

/** Filet entre deux rangées, démarrant à l'alignement du texte (start, miroir en RTL). */
@Composable
public fun SettingsSeparator(tint: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .padding(start = SettingsRowMetrics.separatorInset)
            .fillMaxWidth()
            .height(0.5.dp)
            .background(tint.copy(alpha = 0.12f))
            .clearAndSetSemantics { },
    )
}
