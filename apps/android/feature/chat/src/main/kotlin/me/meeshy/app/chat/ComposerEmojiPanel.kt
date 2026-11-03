package me.meeshy.app.chat

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.ComposerPanelHeightLaw
import me.meeshy.ui.component.EmojiFullPicker

/** Le panneau emoji inline (260 dp) : il prend la place du clavier, sous la barre de saisie, et insère à la sélection. */
@Composable
internal fun ComposerEmojiPanel(accentColor: Color, onSelect: (String) -> Unit) {
    EmojiFullPicker(
        onSelect = onSelect,
        accentColor = accentColor,
        modifier = Modifier.fillMaxWidth().height(ComposerPanelHeightLaw.EMOJI_PANEL_HEIGHT_DP.dp),
    )
}
