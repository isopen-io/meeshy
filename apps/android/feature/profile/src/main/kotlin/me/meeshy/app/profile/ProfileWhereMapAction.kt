package me.meeshy.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
 * Ce que la feuille de la carte offre : exactement ce que la face Actions offre pour la même personne. Écrire suit la fiche
 * (`canMessage`), appeler suit le cercle (`offersCall` est déjà la conjonction de la face), et « partager la mienne » exige
 * le cercle ET qu'elle ne parte pas déjà vers elle — l'arrêter se fait depuis « Où il est », jamais en la repartageant.
 */
internal data class ProfileWhereMapOffers(val write: Boolean, val call: Boolean, val shareMine: Boolean) {
    companion object {
        fun of(canMessage: Boolean, offersCall: Boolean, offersLocation: Boolean, sharingWithThem: Boolean): ProfileWhereMapOffers =
            ProfileWhereMapOffers(write = canMessage, call = offersCall, shareMine = offersLocation && !sharingWithThem)
    }
}

/** Ce que la face Actions a déjà tranché pour la personne, relu par la feuille de la carte. */
internal data class ProfileWhereMapAccess(val canMessage: Boolean, val offersCall: Boolean, val offersLocation: Boolean)

/**
 * « Voir sur la carte » (#18890, planche Carte-Personne) : une action de la face Actions, jamais un onglet. Elle n'est offerte
 * que si la personne me partage sa position — rien à voir sinon, et rien n'est plus fin que ce que la passerelle a servi.
 * La carte s'ouvre en plein écran : l'avatar devient l'épingle, la fiche devient la feuille basse (écrire, appeler,
 * itinéraire, partager la mienne), chacune offerte selon [ProfileWhereMapOffers]. Écrire et appeler ferment la carte avant
 * d'agir.
 *
 * Dès qu'une position m'est SERVIE (quel que soit le cercle : la passerelle a déjà jugé), l'entrée est le BLOC HÉROS de la
 * carte (#20242) : la dernière position connue et son heure ; le toucher ouvre la carte. La lecture des épingles est
 * vivante, et une personne absente du magasin y déclenche un rattrapage ([SharedLocationsMapViewModel.ensure]).
 */
@Composable
internal fun ProfileWhereMapAction(
    userId: String,
    displayName: String,
    access: ProfileWhereMapAccess,
    callbacks: ProfileActionCallbacks,
    mapModel: SharedLocationsMapViewModel = hiltViewModel(),
    shareModel: ProfileShareLocationViewModel = hiltViewModel(key = "share-location-$userId"),
) {
    val pins by mapModel.pins.collectAsStateWithLifecycle()
    val updatedAt by mapModel.updatedAt.collectAsStateWithLifecycle()
    LaunchedEffect(userId) { mapModel.ensure(userId) }
    val sharing by shareModel.state.collectAsStateWithLifecycle()
    var isChoosing by rememberSaveable(userId) { mutableStateOf(false) }
    val permissions = rememberPermissionFlow()
    val scope = rememberCoroutineScope()
    val offers = ProfileWhereMapOffers.of(
        canMessage = access.canMessage,
        offersCall = access.offersCall,
        offersLocation = access.offersLocation,
        sharingWithThem = sharing.entry != null,
    )
    val pin = pins.firstOrNull { it.userId == userId }
    ProfileWhereMapEntry(
        userId = userId,
        sharedWithMe = pin != null,
        entry = { open ->
            pin?.let { ProfileWhereHero(title = displayName, point = it.point, atMillis = updatedAt[userId], onTap = open) }
        },
    ) { close ->
        val onCall = callbacks.onCall?.takeIf { offers.call }
        LocationMapDialog(
            focusUserId = userId,
            displayName = displayName,
            onClose = close,
            onShareMine = if (offers.shareMine) ({ isChoosing = true }) else null,
            onWrite = if (offers.write) ({ close(); callbacks.onSendMessage() }) else null,
            onCall = onCall?.let { call -> { close(); call(false) } },
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

/**
 * L'entrée et la carte, séparées : le bouton ne se montre que tant que la personne me partage sa position, mais la carte
 * OUVERTE ne se referme jamais d'elle-même quand le partage s'arrête — elle passe à son état vide (« X ne partage pas sa
 * position ») et l'utilisateur la ferme.
 */
@Composable
internal fun ProfileWhereMapEntry(
    userId: String,
    sharedWithMe: Boolean,
    entry: @Composable (open: () -> Unit) -> Unit = { open -> ProfileWhereMapButton(open) },
    map: @Composable (close: () -> Unit) -> Unit,
) {
    var isOpen by rememberSaveable(userId) { mutableStateOf(false) }
    if (sharedWithMe) entry { isOpen = true }
    if (isOpen) map { isOpen = false }
}

@Composable
private fun ProfileWhereMapButton(open: () -> Unit) {
    MeeshyButton(
        title = stringResource(R.string.location_map_open),
        onClick = open,
        icon = MeeshyIcons.Map,
        kind = MeeshyButtonKind.Tinted,
        size = MeeshyButtonSize.S44,
        width = MeeshyButtonWidth.Fill,
    )
}
