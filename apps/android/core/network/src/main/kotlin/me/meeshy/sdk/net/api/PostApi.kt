package me.meeshy.sdk.net.api

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.DiscoverabilityPrecision
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.NearbyDensityCell
import me.meeshy.sdk.model.PostShareResult
import me.meeshy.sdk.model.PublicationModerationReceipt
import me.meeshy.sdk.model.PostViewersResponse
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryEffectsWireSerializer
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Create a post — port of CreatePostRequest (ServiceModels.swift). */
@Serializable
data class CreatePostRequest(
    val content: String? = null,
    val type: String = "POST",
    val visibility: String = "PUBLIC",
    val moodEmoji: String? = null,
    val mediaIds: List<String>? = null,
    val audioUrl: String? = null,
    val audioDuration: Int? = null,
    val originalLanguage: String? = null,
    val mobileTranscription: MobileTranscriptionPayload? = null,
    val repostOfId: String? = null,
    val viaUsername: String? = null,
    /**
     * Optional attached location — the exact `{latitude, longitude, name, address,
     * category}` shape the gateway's `parseSharedPlace` validates
     * (`services/gateway/src/services/location/sharedPlace.ts`).
     */
    val location: SharedPlace? = null,
    /**
     * Author-authored accessibility description, per media id (#6739) — same
     * contract as web's `CreatePostRequest.mediaAlt`: key is one of the ids in
     * [mediaIds], the gateway ignores any key absent from it
     * (`services/gateway/src/routes/posts/types.ts`, `CreatePostSchema.mediaAlt`).
     */
    val mediaAlt: Map<String, String>? = null,
    /** Audience restreinte (`EXCEPT` / `ONLY`) : les ids concernés. */
    val visibilityUserIds: List<String>? = null,
    /** Scène composée (v1 + canvas v3), absente d'un post sans scène. */
    @Serializable(with = StoryEffectsWireSerializer::class)
    val storyEffects: StoryEffects? = null,
    val allowSoundExtraction: Boolean? = null,
    /** `null` = ne rien déclarer ; jamais `[]` (ne pas effacer). */
    val mentions: List<PostMentionInput>? = null,
    /** Légende visible par média, clé = un id de [mediaIds]. */
    val mediaCaption: Map<String, String>? = null,
    val discoverabilityPrecision: DiscoverabilityPrecision? = null,
)

/** Le modèle vit dans :core:model ; ces alias gardent les imports historiques valides. */
typealias MobileTranscriptionPayload = me.meeshy.sdk.model.MobileTranscriptionPayload
typealias MobileTranscriptionSegment = me.meeshy.sdk.model.MobileTranscriptionSegment

/**
 * Create a story — port of CreateStoryRequest (ServiceModels.swift).
 *
 * [type] et [visibility] partent TOUJOURS (#4754) : `MeeshyApi.json` n'encode pas les
 * valeurs par défaut, et la passerelle pose `type = POST` sur un corps qui n'en porte
 * pas — la story devenait un post public permanent, sans expiration ni anneau.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class CreateStoryRequest(
    @EncodeDefault val type: String = "STORY",
    val content: String? = null,
    @Serializable(with = StoryEffectsWireSerializer::class)
    val storyEffects: StoryEffects? = null,
    @EncodeDefault val visibility: String = "PUBLIC",
    val originalLanguage: String? = null,
    val mediaIds: List<String>? = null,
    val repostOfId: String? = null,
    val visibilityUserIds: List<String>? = null,
    val mentions: List<PostMentionInput>? = null,
    val allowSoundExtraction: Boolean? = null,
    val mediaAlt: Map<String, String>? = null,
    val mediaCaption: Map<String, String>? = null,
    val alsoAsReel: Boolean? = null,
)

/** Update a post — port of UpdatePostRequest (ServiceModels.swift). */
@Serializable
data class UpdatePostRequest(
    val content: String? = null,
    val visibility: String? = null,
    val moodEmoji: String? = null,
    val visibilityUserIds: List<String>? = null,
    val originalLanguage: String? = null,
    val type: String? = null,
    val removeMediaIds: List<String>? = null,
    @Serializable(with = StoryEffectsWireSerializer::class)
    val storyEffects: StoryEffects? = null,
    val mediaIds: List<String>? = null,
    /** `null` = clé absente ; [kotlinx.serialization.json.JsonNull] = effacer ; objet = remplacer. */
    val location: JsonElement? = null,
    /** `null` = clé absente ; `[]` = tout retirer. Jamais INLINE. */
    val mentions: List<PostMentionInput>? = null,
    val allowSoundExtraction: Boolean? = null,
    val mediaAlt: Map<String, String>? = null,
    val mediaCaption: Map<String, String>? = null,
)

/** Create a comment — port of CreateCommentRequest (ServiceModels.swift). */
@Serializable
data class CreateCommentRequest(
    val content: String,
    val parentId: String? = null,
    val effectFlags: Int? = null,
    /** La langue dans laquelle le commentaire est écrit ; absente, la passerelle la devine (#12484). */
    val originalLanguage: String? = null,
)

/** Repost a post — port of RepostRequest (StoryModels.swift). */
@Serializable
data class RepostPostRequest(
    val content: String? = null,
    val isQuote: Boolean = false,
    val targetType: String? = null,
)

/** Request an on-demand translation for a post. */
@Serializable
data class PostTranslationRequest(
    val targetLanguage: String,
)

/** Record a post view with an optional dwell duration. */
@Serializable
data class PostViewRequest(
    val duration: Int? = null,
)

/**
 * Like/react to a post with a chosen [emoji] — port of the iOS `StatusService.react`
 * body (`{ emoji }` to `POST /posts/:id/like`). The gateway defaults to `❤️` when the
 * body is absent, so the plain [PostApi.like] stays valid; this variant carries the
 * emoji a mood-status reaction picks.
 */
@Serializable
data class PostLikeRequest(
    val emoji: String,
)

/** Le corps d'un retrait par la modération : `{ "reason": … }` (#11151). */
@Serializable
data class ContentRemovalBody(val reason: String)

/** Édition d'un commentaire — seuls les champs posés partent. */
@Serializable
data class UpdateCommentRequest(
    val content: String? = null,
    val effectFlags: Int? = null,
    val originalLanguage: String? = null,
)

/** Partage d'un post ; `generateLink = true` demande un lien suivi `meeshy.me/l/<jeton>`. */
@Serializable
data class SharePostRequest(
    val platform: String? = null,
    val generateLink: Boolean? = null,
)

/** Traduction d'un commentaire à la demande vers UNE langue ; `force` rejoue une langue déjà traduite. */
@Serializable
data class CommentTranslationRequest(
    val targetLanguage: String,
    val force: Boolean? = null,
)

/** Publie une pièce jointe reçue en conversation (`POST /posts/from-attachment`). */
@Serializable
data class PublishAttachmentRequest(
    val attachmentId: String,
    val target: String? = null,
    val content: String? = null,
    val capturedInApp: Boolean? = null,
)

/** Un geste de modération de publications (`make-private`) avec son motif. */
@Serializable
data class PublicationModerationRequest(
    val action: String,
    val postIds: List<String>,
    val reason: String? = null,
)

/** En-tête d'idempotence des créations : un rejeu du même geste ne crée rien de plus. */
const val CLIENT_MUTATION_ID_HEADER = "X-Client-Mutation-Id"

interface PostApi {
    @GET("posts/feed")
    suspend fun getFeed(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    /** Friends' mood statuses (`GET /posts/feed/statuses`) — StatusService.Mode.friends. */
    @GET("posts/feed/statuses")
    suspend fun getStatuses(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    /** Discover mood statuses (`GET /posts/feed/statuses/discover`) — StatusService.Mode.discover. */
    @GET("posts/feed/statuses/discover")
    suspend fun getStatusesDiscover(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    /**
     * Vertical full-screen reel thread (`GET /posts/feed/reels`). With [seed] (a
     * reel touched in the Feed) the gateway returns a DISCOVERY thread ranked by
     * affinity to that reel — the seed itself is EXCLUDED from every page ("already
     * shown by the client, entry point of the thread": `PostFeedService.getReels`),
     * so a caller that wants the seed visible keeps showing its own copy of it.
     * Without a seed it returns the seedless "for you" thread. [seed] should be
     * repeated on every subsequent page (not just the first) so the gateway keeps
     * excluding it — see [me.meeshy.sdk.post.PostRepository.getReelsPage].
     */
    @GET("posts/feed/reels")
    suspend fun getReels(
        @Query("seed") seed: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    /**
     * Geolocated discovery feed (`GET /social/posts?scope=nearby`) — the canonical
     * surface (#4346), never the deprecated `/posts/nearby` alias
     * (`services/gateway/src/routes/posts/nearby.ts`).
     */
    @GET("social/posts")
    suspend fun getNearby(
        @Query("scope") scope: String = "nearby",
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("radiusKm") radiusKm: Double,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    @POST("posts")
    suspend fun create(
        @Body body: CreatePostRequest,
        @Header(CLIENT_MUTATION_ID_HEADER) clientMutationId: String? = null,
    ): ApiResponse<ApiPost>

    @POST("posts")
    suspend fun createStory(
        @Body body: CreateStoryRequest,
        @Header(CLIENT_MUTATION_ID_HEADER) clientMutationId: String? = null,
    ): ApiResponse<ApiPost>

    @PUT("posts/{id}")
    suspend fun update(@Path("id") postId: String, @Body body: UpdatePostRequest): ApiResponse<ApiPost>

    @DELETE("posts/{id}")
    suspend fun delete(@Path("id") postId: String): ApiResponse<Unit>

    @GET("posts/{id}")
    suspend fun getPost(@Path("id") postId: String): ApiResponse<ApiPost>

    @POST("posts/{id}/like")
    suspend fun like(@Path("id") postId: String): ApiResponse<Unit>

    /** Like/react to a post carrying a chosen emoji (mood-status reaction). */
    @POST("posts/{id}/like")
    suspend fun likeWithEmoji(
        @Path("id") postId: String,
        @Body body: PostLikeRequest,
    ): ApiResponse<Unit>

    @DELETE("posts/{id}/like")
    suspend fun unlike(@Path("id") postId: String): ApiResponse<Unit>

    @POST("posts/{id}/bookmark")
    suspend fun bookmark(@Path("id") postId: String): ApiResponse<Unit>

    @DELETE("posts/{id}/bookmark")
    suspend fun removeBookmark(@Path("id") postId: String): ApiResponse<Unit>

    @GET("posts/bookmarks")
    suspend fun getBookmarks(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    @POST("posts/{id}/pin")
    suspend fun pin(@Path("id") postId: String): ApiResponse<Unit>

    @DELETE("posts/{id}/pin")
    suspend fun unpin(@Path("id") postId: String): ApiResponse<Unit>

    @POST("posts/{id}/share")
    suspend fun share(@Path("id") postId: String): ApiResponse<Unit>

    @POST("posts/{id}/repost")
    suspend fun repost(
        @Path("id") postId: String,
        @Body body: RepostPostRequest,
        @Header(CLIENT_MUTATION_ID_HEADER) clientMutationId: String? = null,
    ): ApiResponse<ApiPost>

    @POST("posts/{id}/translate")
    suspend fun requestTranslation(
        @Path("id") postId: String,
        @Body body: PostTranslationRequest,
    ): ApiResponse<Unit>

    @POST("posts/{id}/view")
    suspend fun viewPost(
        @Path("id") postId: String,
        @Body body: PostViewRequest,
    ): ApiResponse<Unit>

    @GET("posts/{id}/views")
    suspend fun getPostViews(
        @Path("id") postId: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): ApiResponse<PostViewersResponse>

    @GET("posts/user/{userId}")
    suspend fun getUserPosts(
        @Path("userId") userId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    @GET("posts/community/{communityId}")
    suspend fun getCommunityPosts(
        @Path("communityId") communityId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    @GET("posts/{id}/comments")
    suspend fun getComments(
        @Path("id") postId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPostComment>>

    @POST("posts/{id}/comments")
    suspend fun addComment(
        @Path("id") postId: String,
        @Body body: CreateCommentRequest,
        @Header(CLIENT_MUTATION_ID_HEADER) clientMutationId: String? = null,
    ): ApiResponse<ApiPostComment>

    @GET("posts/{id}/comments/{commentId}/replies")
    suspend fun getCommentReplies(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPostComment>>

    @POST("posts/{id}/comments/{commentId}/like")
    suspend fun likeComment(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
    ): ApiResponse<Unit>

    @DELETE("posts/{id}/comments/{commentId}/like")
    suspend fun unlikeComment(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
    ): ApiResponse<Unit>

    @DELETE("posts/{id}/comments/{commentId}")
    suspend fun deleteComment(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
    ): ApiResponse<Unit>

    /** Posts portant un mot-dièse (`GET /posts/hashtag/{tag}`), pagination par curseur. */
    @GET("posts/hashtag/{tag}")
    suspend fun getByHashtag(
        @Path("tag") tag: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiPost>>

    /** Carte de densité « À proximité » : `cellSizeKm` doit être un pas de [me.meeshy.sdk.model.NearbyDensityCellSize]. */
    @GET("posts/nearby/density")
    suspend fun getNearbyDensity(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("radiusKm") radiusKm: Double,
        @Query("cellSizeKm") cellSizeKm: Double,
    ): ApiResponse<List<NearbyDensityCell>>

    /** Retrait d'un post par la modération : le DELETE porte le motif en corps. */
    @HTTP(method = "DELETE", path = "posts/{id}", hasBody = true)
    suspend fun deleteWithReason(
        @Path("id") postId: String,
        @Body body: ContentRemovalBody,
    ): ApiResponse<Unit>

    /** Retrait d'un commentaire par la modération : le DELETE porte le motif en corps. */
    @HTTP(method = "DELETE", path = "posts/{id}/comments/{commentId}", hasBody = true)
    suspend fun deleteCommentWithReason(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
        @Body body: ContentRemovalBody,
    ): ApiResponse<Unit>

    @PATCH("posts/{id}/comments/{commentId}")
    suspend fun updateComment(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
        @Body body: UpdateCommentRequest,
    ): ApiResponse<ApiPostComment>

    @POST("posts/{id}/comments/{commentId}/translate")
    suspend fun requestCommentTranslation(
        @Path("id") postId: String,
        @Path("commentId") commentId: String,
        @Body body: CommentTranslationRequest,
    ): ApiResponse<Unit>

    /** Compte un partage et, sur demande, frappe le lien suivi (`generateLink`). */
    @POST("posts/{id}/share")
    suspend fun shareWithLink(
        @Path("id") postId: String,
        @Body body: SharePostRequest,
    ): ApiResponse<PostShareResult>

    /** Traduction à la demande de la LÉGENDE d'un média de post. */
    @POST("posts/media/{mediaId}/caption/translate")
    suspend fun requestMediaCaptionTranslation(
        @Path("mediaId") mediaId: String,
        @Body body: PostTranslationRequest,
    ): ApiResponse<Unit>

    /** Publie une pièce jointe de conversation ; soumis à la porte e-mail côté intercepteur, pas ici. */
    @POST("posts/from-attachment")
    suspend fun publishAttachment(@Body body: PublishAttachmentRequest): ApiResponse<ApiPost>

    /** Rendre privée la publication d'un autre : la même porte que la console d'administration. */
    @POST("admin/users/{authorId}/publications/moderation")
    suspend fun moderatePublications(
        @Path("authorId") authorId: String,
        @Body body: PublicationModerationRequest,
    ): ApiResponse<PublicationModerationReceipt>
}
