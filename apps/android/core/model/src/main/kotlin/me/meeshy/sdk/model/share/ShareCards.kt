package me.meeshy.sdk.model.share

import java.net.URLEncoder
import me.meeshy.sdk.model.PostShareLink

/**
 * **Les cartes que les portes posent sur la feuille de partage unique** (#13474) — une story, un post, un
 * réel, un profil. L'adresse de chaque contenu a UN site ici ; le texte qui part (« Story de X : lien ») est
 * composé par la porte, dans la langue de l'appareil, et reçu déjà prêt. Miroir de `ShareSubject.story/post/
 * reel/profile` (iOS) : une story part comme sa phrase, les autres comme leur lien.
 */
object ShareCards {
    private const val WEB = "https://meeshy.me"

    fun storyUrl(storyId: String): String = "$WEB/story/${URLEncoder.encode(storyId, "UTF-8")}"

    /**
     * [messageText] : la phrase de la story déjà composée avec [storyUrl] (« 🔗 Story de X : lien ») ; [isPublic] : la
     * story est publique, seule audience qui reçoit un lien suivi.
     */
    fun story(storyId: String, authorId: String?, messageText: String, imageUrl: String? = null, isPublic: Boolean = false) = ShareCard(
        kind = ShareCardKind.STORY,
        contentId = storyId,
        title = messageText,
        url = storyUrl(storyId),
        messageText = messageText,
        imageUrl = imageUrl,
        authorId = authorId,
        isPublicStory = isPublic,
    )

    /**
     * [messageText] : la phrase déjà composée avec [PostShareLink.webLink] (« 🔗 Publication de X : lien », la forme de la
     * story), sinon le lien seul.
     */
    fun post(postId: String, title: String, authorId: String? = null, imageUrl: String? = null, messageText: String = PostShareLink.webLink(postId)) = ShareCard(
        kind = ShareCardKind.POST, contentId = postId, title = title, url = PostShareLink.webLink(postId),
        messageText = messageText, imageUrl = imageUrl, authorId = authorId,
    )

    /** [messageText] : « 🔗 Réel de X : lien », sinon le lien seul. */
    fun reel(reelId: String, title: String, authorId: String? = null, imageUrl: String? = null, messageText: String = PostShareLink.webLink(reelId)) = ShareCard(
        kind = ShareCardKind.REEL, contentId = reelId, title = title, url = PostShareLink.webLink(reelId),
        messageText = messageText, imageUrl = imageUrl, authorId = authorId,
    )

    /** [messageText] : le texte du profil déjà composé avec son lien (« Profil de X : lien »). */
    fun profile(userId: String, title: String, webLink: String, messageText: String, imageUrl: String? = null) = ShareCard(
        kind = ShareCardKind.PROFILE, contentId = userId, title = title, url = webLink, messageText = messageText,
        imageUrl = imageUrl, authorId = userId,
    )
}
