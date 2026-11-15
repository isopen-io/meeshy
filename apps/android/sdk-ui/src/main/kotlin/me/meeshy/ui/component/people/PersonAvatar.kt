package me.meeshy.ui.component.people

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.hexColor

/**
 * L'avatar d'une personne dans une liste (iOS : le contexte `.userListItem` de l'avatar commun). La présence est celle
 * DÉJÀ résolue par la loi unique (`UserPresence.state` → `meeshyPresenceDotColor`) : en ligne vert, absent
 * orange, inactif gris, hors ligne ou donnée absente = aucun point. L'humeur remplace le point. Photo et
 * contour passent par l'avatar commun ; sans photo, initiales sur la couleur déterministe du nom.
 */
@Composable
public fun PersonAvatar(
    name: String,
    modifier: Modifier = Modifier,
    imageUrl: String? = null,
    presence: PresenceState? = null,
    moodEmoji: String? = null,
    ring: ServedProfileDecorItem? = null,
    userId: String? = null,
) {
    MeeshyAvatar(
        name = name,
        context = AvatarContext.UserListItem,
        modifier = modifier,
        containerColor = hexColor(DynamicColorGenerator.colorForName(name)),
        presence = presence,
        moodEmoji = moodEmoji,
        imageUrl = imageUrl,
        userId = userId,
        decorRing = ring,
    )
}
