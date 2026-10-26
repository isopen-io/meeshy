package me.meeshy.app.feed

import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import me.meeshy.feature.feed.R

/**
 * L'avatar et le nom d'un auteur ouvrent son profil (iOS `onViewProfile` de `FeedPostCard+Header`).
 * Sans identifiant d'auteur, ou sans hôte qui sache naviguer, le contrôle n'existe pas : aucune
 * zone tactile morte.
 */
@Composable
internal fun Modifier.opensAuthorProfile(authorId: String?, onOpenProfile: ((String) -> Unit)?): Modifier {
    if (authorId.isNullOrBlank() || onOpenProfile == null) return this
    val label = stringResource(R.string.feed_action_view_profile)
    return clickable(onClickLabel = label, role = Role.Button) { onOpenProfile(authorId) }
}
