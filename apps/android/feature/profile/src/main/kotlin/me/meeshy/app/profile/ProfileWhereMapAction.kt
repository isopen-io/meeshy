package me.meeshy.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import me.meeshy.app.contacts.circles.LocationMapDialog
import me.meeshy.app.contacts.circles.SharedLocationsMapViewModel
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.ui.component.kit.MeeshyButton
import me.meeshy.ui.component.kit.MeeshyButtonKind
import me.meeshy.ui.component.kit.MeeshyButtonSize
import me.meeshy.ui.component.kit.MeeshyButtonWidth
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.icons.MeeshyIcons

/**
 * « Voir sur la carte » (#18890, planche Carte-Personne) : une action de la face Actions, jamais un onglet. Elle n'est offerte
 * que si la personne me partage sa position — rien à voir sinon, et rien n'est plus fin que ce que la passerelle a servi.
 * La carte s'ouvre en plein écran : l'avatar devient l'épingle, la fiche devient la feuille basse (écrire, appeler,
 * itinéraire, partager la mienne). Les actions écrire et appeler sont celles de la fiche, fermées avec la carte.
 */
@Composable
internal fun ProfileWhereMapAction(
    userId: String,
    displayName: String,
    callbacks: ProfileActionCallbacks,
    mapModel: SharedLocationsMapViewModel = hiltViewModel(),
    shareModel: ProfileShareLocationViewModel = hiltViewModel(key = "share-location-$userId"),
) {
    val pins by mapModel.pins.collectAsStateWithLifecycle()
    var isOpen by rememberSaveable(userId) { mutableStateOf(false) }
    var isChoosing by rememberSaveable(userId) { mutableStateOf(false) }
    val permissions = rememberPermissionFlow()
    val scope = rememberCoroutineScope()
    if (pins.none { it.userId == userId }) return
    MeeshyButton(
        title = stringResource(R.string.location_map_open),
        onClick = { isOpen = true },
        icon = MeeshyIcons.Map,
        kind = MeeshyButtonKind.Tinted,
        size = MeeshyButtonSize.S44,
        width = MeeshyButtonWidth.Fill,
    )
    if (isOpen) {
        LocationMapDialog(
            focusUserId = userId,
            displayName = displayName,
            onClose = { isOpen = false },
            onShareMine = { isChoosing = true },
            onWrite = {
                isOpen = false
                callbacks.onSendMessage()
            },
            onCall = callbacks.onCall?.let { call ->
                {
                    isOpen = false
                    call(false)
                }
            },
        )
    }
    if (isChoosing) {
        ShareLocationChoiceSheet(
            displayName = displayName,
            onDismiss = { isChoosing = false },
            onShare = { precision, duration ->
                isChoosing = false
                scope.launch {
                    permissions.ensure(PermissionNature.LOCATION)
                    shareModel.share(precision, duration)
                }
            },
        )
    }
}
