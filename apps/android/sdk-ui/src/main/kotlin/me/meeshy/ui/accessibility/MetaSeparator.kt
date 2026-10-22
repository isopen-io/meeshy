package me.meeshy.ui.accessibility

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** Séparateur « · » d'une ligne de métadonnées : visible, jamais lu par le lecteur d'écran. */
@Composable
public fun MetaSeparator(modifier: Modifier = Modifier, glyph: String = "·") {
    Text(text = glyph, modifier = modifier.decorative())
}
