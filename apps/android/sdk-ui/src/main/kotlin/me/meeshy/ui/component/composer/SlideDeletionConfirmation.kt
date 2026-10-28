package me.meeshy.ui.component.composer

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
        AlertDialog(
            onDismissRequest = { pending = null },
            title = { Text(stringResource(R.string.slide_rail_delete_confirm_title)) },
            confirmButton = {
                TextButton(onClick = { pending = null; confirmed(id) }) {
                    Text(stringResource(R.string.slide_rail_delete_confirm_action), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { pending = null }) { Text(stringResource(R.string.slide_rail_delete_cancel)) } },
        )
    }
    return remember { { id: String -> pending = id } }
}
