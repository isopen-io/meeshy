package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.ProfileTapRoute
import me.meeshy.ui.profile.LocalProfileSheetOpener

/**
 * Le toucher d'une personne dans une conversation. Un compte ouvre la fiche utilisateur par l'ouvreur
 * global ; un visiteur sans compte ouvre la fiche de PARTICIPATION de CETTE conversation, jamais une
 * fiche de compte (son `senderId` est un `Participant.id`). [readerRole] — le rôle du LECTEUR dans la conversation —
 * fait jouer la garde de rôle du cache de la fiche (ADR-032) : sans lui, aucune copie n'est peinte.
 */
@Composable
internal fun rememberProfileTap(
    conversationId: String,
    accentColor: Color,
    readerRole: String?,
): (ProfileSheetUser) -> Unit {
    val opener = LocalProfileSheetOpener.current
    var participation by remember(conversationId) { mutableStateOf<ProfileTapRoute.Participation?>(null) }
    participation?.let { route ->
        ParticipantProfileSheet(
            conversationId = conversationId,
            participantId = route.participantId,
            displayName = route.user.resolvedDisplayName,
            accentColor = accentColor,
            onDismiss = { participation = null },
            avatarUrl = route.user.avatarUrl,
            readerRole = readerRole,
        )
    }
    return remember(opener) {
        { user: ProfileSheetUser ->
            when (val route = ProfileTapRoute.of(user)) {
                is ProfileTapRoute.Account -> opener.open(route.user)
                is ProfileTapRoute.Participation -> participation = route
                ProfileTapRoute.None -> Unit
            }
        }
    }
}
