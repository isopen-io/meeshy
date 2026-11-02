package me.meeshy.sdk.post

import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.socket.collectArrived

/** Le post modifié par son auteur (`post:updated`) s'écrit dans le fil. */
suspend fun SocialSocketManager.writePostUpdatesTo(posts: PostRepository) {
    postUpdated.collectArrived { posts.applyPostUpdate(it.post) }
}

/** La traduction d'un post poussée par la passerelle (`post:translation-updated`) s'écrit dans le fil. */
suspend fun SocialSocketManager.writePostTranslationsTo(posts: PostRepository) {
    postTranslationUpdated.collectArrived { posts.applyTranslationUpdate(it.postId, it.language, it.translation) }
}

/** La traduction de légende d'un média poussée par la passerelle s'écrit dans le fil. */
suspend fun SocialSocketManager.writeMediaCaptionTranslationsTo(posts: PostRepository) {
    mediaCaptionTranslationUpdated.collectArrived {
        posts.applyMediaCaptionTranslationUpdate(it.postId, it.mediaId, it.commentId, it.language, it.translation)
    }
}
