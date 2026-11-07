package me.meeshy.app.contacts.circles

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.ui.R as UiR
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

internal const val CIRCLE_BLOCK_BRING_TAG = "circles.settings.blockBring"

private const val FAILURE_VISIBLE_MS = 4_000L

/**
 * L'interrupteur ACTIF « Bloquer ses Bring » de la fiche d'un lien (#16617) — iso `CircleBringBlockToggle.swift`. La ligne
 * entière bascule (48 dp), annoncée comme un interrupteur par TalkBack.
 */
@Composable
internal fun CircleBringBlockToggle(
    userId: String,
    title: String,
    viewModel: CircleBringBlockViewModel = hiltViewModel(key = "bring-block-$userId"),
) {
    LaunchedEffect(userId) { viewModel.load(userId) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .toggleable(
                    value = state.blocked,
                    enabled = !state.isSaving,
                    role = Role.Switch,
                    onValueChange = viewModel::setBlocked,
                )
                .testTag(CIRCLE_BLOCK_BRING_TAG),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.weight(1f),
            )
            Switch(checked = state.blocked, onCheckedChange = null, enabled = !state.isSaving)
        }
        if (state.failed) {
            LaunchedEffect(Unit) {
                delay(FAILURE_VISIBLE_MS)
                viewModel.consumeFailure()
            }
            Text(
                text = stringResource(UiR.string.circles_notice_lower_failed),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyPalette.Error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            )
        }
    }
}
