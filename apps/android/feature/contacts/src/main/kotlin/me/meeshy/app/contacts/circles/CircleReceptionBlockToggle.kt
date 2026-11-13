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
import me.meeshy.sdk.model.relation.RelationPersonSwitch
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import me.meeshy.sdk.model.relation.RelationShareGrant
import me.meeshy.ui.R as UiR
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

internal const val CIRCLE_BLOCK_BRING_TAG = "circles.settings.blockBring"
internal const val CIRCLE_BLOCK_TALKIE_TAG = "circles.settings.blockTalkie"
internal const val CIRCLE_SHARE_LISTENING_TAG = "circles.settings.listening"

private const val FAILURE_VISIBLE_MS = 4_000L

/**
 * L'interrupteur ACTIF d'un réglage par personne sur la fiche d'un lien — « Bloquer ses Bring » (#16617), « Couper son
 * talkie » (#16675) et « Ce que j'écoute » (#16836) —, iso `CircleReceptionBlockToggle.swift`. La ligne entière bascule (48 dp), annoncée comme un
 * interrupteur par TalkBack, avec son explication quand elle en a une.
 */
@Composable
internal fun CircleReceptionBlockToggle(
    userId: String,
    personSwitch: RelationPersonSwitch,
    title: String,
    detail: String? = null,
    viewModel: CircleReceptionBlockViewModel = hiltViewModel(key = "person-switch-${personSwitch.tag()}-$userId"),
) {
    LaunchedEffect(userId, personSwitch) { viewModel.load(userId, personSwitch) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .toggleable(
                    value = state.isOn,
                    enabled = !state.isSaving,
                    role = Role.Switch,
                    onValueChange = viewModel::setOn,
                )
                .testTag(personSwitch.tag()),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.weight(1f),
            )
            Switch(checked = state.isOn, onCheckedChange = null, enabled = !state.isSaving)
        }
        detail?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
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

private fun RelationPersonSwitch.tag(): String = when (this) {
    is RelationPersonSwitch.Reception -> when (setting) {
        RelationReceptionSetting.BRING -> CIRCLE_BLOCK_BRING_TAG
        RelationReceptionSetting.TALKIE -> CIRCLE_BLOCK_TALKIE_TAG
    }
    is RelationPersonSwitch.Share -> when (grant) {
        RelationShareGrant.LISTENING_CATEGORY -> CIRCLE_SHARE_LISTENING_TAG
    }
}
