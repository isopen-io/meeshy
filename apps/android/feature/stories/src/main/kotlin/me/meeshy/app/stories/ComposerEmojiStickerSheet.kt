package me.meeshy.app.stories

import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * La feuille de stickers que le composeur universel ouvre (#14320) : celle de la scène des stories ([StickerPickerPanel] —
 * Recherche, Favoris, Récents, catégories d'emojis), dans sa coque de bas d'écran. L'application la prête aux
 * commentaires et aux conversations par `LocalComposerStickerSheet`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComposerEmojiStickerSheet(onPick: (String) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false),
        containerColor = Color.Transparent,
        dragHandle = { BottomSheetDefaults.DragHandle() },
    ) {
        StickerPickerPanel(onPick = onPick, onDismiss = onDismiss)
    }
}
