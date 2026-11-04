package me.meeshy.ui.component.people

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.friend.ConnectAction
import me.meeshy.sdk.model.friend.ConnectionActionRender
import me.meeshy.ui.component.ConnectionActionChip
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le contrôle de connexion d'une ligne de personne, extrait de `DiscoverTab` pour servir Découvrir, Demandes
 * et Bloqués : Se connecter / En attente / Accepter-Refuser / Contact / Bloqué, rien pour soi
 * ([ConnectAction.Hidden]). Désactivé tant qu'une action est en cours ([busy]). Le rendu est celui de
 * [ConnectionActionChip], inchangé.
 */
@Composable
public fun ConnectControl(
    action: ConnectAction,
    userName: String,
    onAdd: () -> Unit,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    busy: Boolean = false,
    accent: Color = MeeshyPalette.Indigo500,
) {
    ConnectionActionChip(
        render = ConnectionActionRender.from(action),
        userName = userName,
        accent = accent,
        onAdd = onAdd,
        onAccept = onAccept,
        onDecline = onDecline,
        onCancel = onCancel,
        modifier = modifier,
        enabled = !busy,
    )
}
