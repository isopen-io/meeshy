package me.meeshy.app.feed

import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketPostBookmarkedData
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostRepostedData
import me.meeshy.sdk.model.SocketPostTranslationUpdatedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.model.SocketPostUpdatedData
import me.meeshy.sdk.socket.SocialSocketManager

/** Une socket sociale dont chaque flux se pilote à la main (aucun événement par défaut). */
internal class FakeProfileSocial {
    val likedFlow = MutableSharedFlow<SocketPostLikedData>(extraBufferCapacity = 16)
    val unlikedFlow = MutableSharedFlow<SocketPostUnlikedData>(extraBufferCapacity = 16)
    val bookmarkedFlow = MutableSharedFlow<SocketPostBookmarkedData>(extraBufferCapacity = 16)
    val repostedFlow = MutableSharedFlow<SocketPostRepostedData>(extraBufferCapacity = 16)
    val deletedFlow = MutableSharedFlow<SocketPostDeletedData>(extraBufferCapacity = 16)
    val updatedFlow = MutableSharedFlow<SocketPostUpdatedData>(extraBufferCapacity = 16)
    val commentAddedFlow = MutableSharedFlow<SocketCommentAddedData>(extraBufferCapacity = 16)
    val commentDeletedFlow = MutableSharedFlow<SocketCommentDeletedData>(extraBufferCapacity = 16)
    val translatedFlow = MutableSharedFlow<SocketPostTranslationUpdatedData>(extraBufferCapacity = 16)

    val socket: SocialSocketManager = mockk(relaxed = true) {
        every { postLiked } returns likedFlow
        every { postUnliked } returns unlikedFlow
        every { postBookmarked } returns bookmarkedFlow
        every { postReposted } returns repostedFlow
        every { postDeleted } returns deletedFlow
        every { postUpdated } returns updatedFlow
        every { commentAdded } returns commentAddedFlow
        every { commentDeleted } returns commentDeletedFlow
        every { postTranslationUpdated } returns translatedFlow
    }
}
