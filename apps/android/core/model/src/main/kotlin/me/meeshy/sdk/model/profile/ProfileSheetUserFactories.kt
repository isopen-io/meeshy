package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.FeedComment
import me.meeshy.sdk.model.FeedPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.RepostContent
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.WireDate
import me.meeshy.sdk.model.interlocutor

/**
 * Une fabrique par surface d'où une fiche peut s'ouvrir (miroir des `ProfileSheetUser.from(...)`
 * iOS). Aucune ne casse sur un champ absent.
 */

/**
 * L'auteur d'un message. Sans compte (`sender.userId` absent alors qu'un expéditeur est servi),
 * [ProfileSheetUser.userId] reste nul et `senderId` — un `Participant.id` — voyage dans
 * [ProfileSheetUser.participantId].
 */
fun ProfileSheetUser.Companion.from(
    message: ApiMessage,
    senderIsAnonymous: Boolean = message.sender != null && message.sender?.userId.isNullOrBlank(),
): ProfileSheetUser {
    val sender = message.sender
    val participantId = (message.senderId ?: sender?.id)?.takeIf { it.isNotBlank() }
    val accountId = sender?.userId?.takeIf { it.isNotBlank() }
    val name = sender?.displayName?.takeIf { it.isNotBlank() }
    return ProfileSheetUser(
        userId = if (senderIsAnonymous) null else (accountId ?: participantId),
        username = sender?.username?.takeIf { it.isNotBlank() } ?: name ?: "?",
        displayName = name,
        avatarUrl = sender?.avatar,
        participantId = participantId,
        isAnonymous = senderIsAnonymous,
    )
}

fun ProfileSheetUser.Companion.from(storyGroup: StoryGroup): ProfileSheetUser =
    ProfileSheetUser(
        userId = storyGroup.id.takeIf { it.isNotBlank() },
        username = storyGroup.username,
        avatarUrl = storyGroup.avatarURL,
        accentColor = storyGroup.avatarColor,
    )

fun ProfileSheetUser.Companion.from(feedPost: FeedPost): ProfileSheetUser =
    ProfileSheetUser(
        userId = feedPost.authorId.takeIf { it.isNotEmpty() },
        username = feedPost.authorUsername ?: feedPost.author,
        displayName = feedPost.author,
        avatarUrl = feedPost.authorAvatarURL,
        accentColor = feedPost.authorColor,
    )

/** Référence de post ou repost : l'auteur du contenu reposté. */
fun ProfileSheetUser.Companion.from(repost: RepostContent): ProfileSheetUser =
    ProfileSheetUser(
        userId = repost.authorId.takeIf { it.isNotEmpty() },
        username = repost.authorUsername ?: repost.author,
        displayName = repost.author,
        avatarUrl = repost.authorAvatarURL,
        accentColor = repost.authorColor,
    )

fun ProfileSheetUser.Companion.fromReference(
    userId: String?,
    username: String,
    displayName: String? = null,
    avatar: String? = null,
): ProfileSheetUser =
    ProfileSheetUser(
        userId = userId?.takeIf { it.isNotEmpty() },
        username = username,
        displayName = displayName,
        avatarUrl = avatar,
    )

fun ProfileSheetUser.Companion.from(feedComment: FeedComment): ProfileSheetUser =
    ProfileSheetUser(
        userId = feedComment.authorId.takeIf { it.isNotEmpty() },
        username = feedComment.authorUsername ?: feedComment.author,
        displayName = feedComment.author,
        avatarUrl = feedComment.authorAvatarURL,
        accentColor = feedComment.authorColor,
    )

/** Le PAIR d'une conversation directe (pas le lecteur) ; `null` pour un groupe ou sans pair élu. */
fun ProfileSheetUser.Companion.from(conversation: ApiConversation, readerId: String?): ProfileSheetUser? {
    val peer = conversation.interlocutor(readerId) ?: return null
    return ProfileSheetUser(
        userId = peer.userId,
        username = peer.username ?: peer.name ?: peer.userId,
        displayName = peer.name,
        avatarUrl = peer.avatarUrl,
    )
}

fun ProfileSheetUser.Companion.from(user: MeeshyUser, accentColor: String = ""): ProfileSheetUser {
    val composedName = listOfNotNull(user.firstName, user.lastName)
        .filter { it.isNotEmpty() }
        .joinToString(" ")
        .takeIf { it.isNotEmpty() }
    return ProfileSheetUser(
        userId = user.id,
        username = user.username,
        displayName = user.displayName ?: composedName,
        avatarUrl = user.avatar,
        accentColor = accentColor,
        bio = user.bio,
        systemLanguage = user.systemLanguage,
        regionalLanguage = user.regionalLanguage,
        isOnline = user.isOnline,
        lastActiveAtEpochMillis = WireDate.epochMillis(user.lastActiveAt),
        createdAtEpochMillis = WireDate.epochMillis(user.createdAt),
        bannerUrl = user.banner,
        timezone = user.timezone,
        registrationCountry = user.registrationCountry,
        profileCompletionRate = user.profileCompletionRate,
        hasE2EE = user.signalIdentityKeyPublic != null,
    )
}
