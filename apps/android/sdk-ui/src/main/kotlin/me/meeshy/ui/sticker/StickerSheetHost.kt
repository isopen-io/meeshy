package me.meeshy.ui.sticker

import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.sticker.StickerUsageStore
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La feuille de stickers dans sa coque de bas d'écran : deux détentes (moitié, plein écran), une poignée.
 * Le fond dégradé indigo est celui du contenu ([StickerSheet]), la coque reste transparente.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun StickerSheetHost(
    capabilities: StickerCapabilities,
    usage: StickerUsageStore,
    destination: StickerPlacementDestination,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    accountId: String? = null,
    accent: Color = MeeshyPalette.Indigo500,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false),
        containerColor = Color.Transparent,
        dragHandle = { BottomSheetDefaults.DragHandle() },
    ) {
        StickerSheet(
            capabilities = capabilities,
            usage = usage,
            destination = destination,
            onDismiss = onDismiss,
            accountId = accountId,
            accent = accent,
        )
    }
}
