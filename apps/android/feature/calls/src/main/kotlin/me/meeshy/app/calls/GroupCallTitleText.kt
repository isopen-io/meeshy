package me.meeshy.app.calls

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.group.GroupCallTitle

/**
 * Le texte du nom d'un appel de groupe dont le principal est parti (#13754, iOS `GroupCallRoster.callTitle`) :
 * le titre du groupe, « Ada, Bruno +2 », un membre encore inconnu dit « Participant », personne « Participants à
 * l'appel ». `null` tant que le siège du principal est tenu : l'appel garde son nom.
 */
@Composable
internal fun groupCallTitleText(title: GroupCallTitle?): String? = when (title) {
    null -> null
    is GroupCallTitle.Group -> title.title
    GroupCallTitle.Everyone -> stringResource(R.string.call_group_stage)
    is GroupCallTitle.Members -> {
        val unknown = stringResource(R.string.call_group_tile_unknown)
        val shown = title.names.joinToString(", ") { it.ifBlank { unknown } }
        if (title.more > 0) stringResource(R.string.call_participants_more, shown, title.more) else shown
    }
}

/** L'écran nomme l'appel par son groupe une fois le principal parti ; l'en-tête et les phases lisent ce nom. */
internal fun CallUiState.withGroupTitle(title: String?): CallUiState =
    if (title == null || title == peerName) this else copy(peerName = title)
