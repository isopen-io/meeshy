package me.meeshy.ui.component.presentation

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

public class MeeshySheetScope internal constructor(
    column: ColumnScope,
    private val onDismissRequest: () -> Unit,
) : ColumnScope by column {
    public fun dismiss(then: () -> Unit = onDismissRequest) {
        then()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun MeeshyModalSheet(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    sheetState: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    containerColor: Color = BottomSheetDefaults.ContainerColor,
    dragHandle: (@Composable () -> Unit)? = { BottomSheetDefaults.DragHandle() },
    contentWindowInsets: @Composable () -> WindowInsets = { BottomSheetDefaults.windowInsets },
    content: @Composable MeeshySheetScope.() -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        modifier = modifier,
        sheetState = sheetState,
        containerColor = containerColor,
        dragHandle = dragHandle,
        contentWindowInsets = contentWindowInsets,
    ) {
        MeeshySheetScope(this, onDismissRequest).content()
    }
}

@Composable
public fun <T : Any> MeeshySheetPresence(item: T?, content: @Composable (T) -> Unit) {
    item?.let { content(it) }
}
