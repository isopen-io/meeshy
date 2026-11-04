package me.meeshy.sdk.post

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.TusUploadExtras
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.SessionRefresher
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Singleton

/** Le publieur de l'application : le réseau réel (iOS `CommentPublisher.reseau`). */
@Module
@InstallIn(SingletonComponent::class)
public object CommentPublisherModule {

    @Provides
    @Singleton
    public fun commentPublisher(
        tokens: TokenStore,
        refresher: SessionRefresher,
        tus: TusUploadRepository,
        postApi: PostApi,
    ): CommentPublisher = CommentPublisher(
        prepare = { if (refresher.isDueForRefresh()) refresher.freshAuthToken() },
        token = { tokens.jwt },
        upload = { piece, bearer ->
            val item = MediaUploadItem.onDisk(piece.file, piece.file.name, piece.mimeType)
            val extras = TusUploadExtras(thumbHash = piece.thumbHash, authorization = "Bearer $bearer")
            tus.upload(item, TusUploadContext.COMMENT, extras = extras).let { result ->
                when (result) {
                    is NetworkResult.Failure -> result
                    is NetworkResult.Success -> result.data.firstOrNull()?.let { NetworkResult.Success(it.id) }
                        ?: NetworkResult.Failure(ApiError(message = "Upload returned no media", code = "TUS_NO_MEDIA"))
                }
            }
        },
        create = { creation, bearer ->
            val request = creation.comment.toRequest(creation.attachmentIds)
            apiCall {
                val response = postApi.addComment(creation.postId, request, creation.clientMutationId, "Bearer $bearer")
                if (response.success && response.data == null) response.copy(data = ApiPostComment(id = "")) else response
            }.map { served -> served.takeIf { it.id.isNotEmpty() } }
        },
    )
}
