package me.meeshy.app.chat

import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.theme.MeeshyTheme

/** La feuille d'emojis ouverte par la tuile Emoji du plateau. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ComposerEmojiSheet(accentColor: Color, onSelect: (String) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        EmojiFullPicker(onSelect = onSelect, accentColor = accentColor, modifier = Modifier.navigationBarsPadding())
    }
}
