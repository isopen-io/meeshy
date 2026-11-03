package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.ofAuthor
import me.meeshy.sdk.model.profile.ofMention
import me.meeshy.ui.profile.opensProfile

/**
 * L'avatar et le nom d'un auteur ouvrent sa fiche par l'ouvreur global (iOS `onViewProfile` de
 * `FeedPostCard+Header`) avec l'identité fabriquée par la surface. Sans identité exploitable, le contrôle
 * n'existe pas : aucune zone tactile morte.
 */
@Composable
internal fun Modifier.opensAuthorProfile(user: ProfileSheetUser?, minTarget: Boolean = false): Modifier =
    opensProfile(user, minTarget)

internal fun FeedPostPresentation.authorProfile(): ProfileSheetUser? =
    ProfileSheetUser.ofAuthor(authorId, authorUsername, authorName, authorAvatarUrl)

internal fun CommentPresentation.authorProfile(): ProfileSheetUser? =
    authorId?.let { ProfileSheetUser.ofAuthor(it, displayName = authorName, avatarUrl = authorAvatarUrl) }

internal fun RepostEmbedPresentation.authorProfile(): ProfileSheetUser? =
    ProfileSheetUser.ofAuthor(authorId, authorUsername, authorName, authorAvatarUrl)

/** Une mention `@pseudo` du texte d'un post : le compte quand le post le connaît, sinon la fiche s'ouvre par le pseudo. */
internal fun FeedPostPresentation.mentionProfile(username: String): ProfileSheetUser? {
    val handle = username.trim().lowercase()
    return ProfileSheetUser.ofMention(handle, knownUserId = mentionUserIds[handle])
}
