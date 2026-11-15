package me.meeshy.ui.component.composer

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import me.meeshy.ui.R

/**
 * The one question every slide rail asks before a scene leaves (story, post, reel): the bin and the TalkBack action both go
 * through it, empty scene or not. Returns the request to call with the id of the scene to delete; the dialog it raises is
 * emitted at the call site. Cancel changes nothing; Delete forwards the id to [onConfirmed] exactly once.
 */
@Composable
public fun rememberConfirmedSlideDeletion(onConfirmed: (String) -> Unit): (String) -> Unit {
    var pending by remember { mutableStateOf<String?>(null) }
    val confirmed by rememberUpdatedState(onConfirmed)
    pending?.let { id ->
        ComposerConfirmationDialog(
            title = stringResource(R.string.slide_rail_delete_confirm_title),
            destructiveLabel = stringResource(R.string.slide_rail_delete_confirm_action),
            onDestructive = { pending = null; confirmed(id) },
            safeLabel = stringResource(R.string.slide_rail_delete_cancel),
            onSafe = { pending = null },
            onDismissRequest = { pending = null },
        )
    }
    return remember { { id: String -> pending = id } }
}
