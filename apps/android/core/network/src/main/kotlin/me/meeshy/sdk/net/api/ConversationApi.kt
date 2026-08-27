package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipantProfile
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.HistoryGrantUpdate
import me.meeshy.sdk.model.ConversationAnalysis
import me.meeshy.sdk.model.ConversationMessageStatsResponse
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.model.JoinAuthenticatedResponse
import me.meeshy.sdk.model.PaginatedParticipantsResponse
import me.meeshy.sdk.model.UpdateConversationResponse
import me.meeshy.sdk.model.UpdateConversationSettingsRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Partial per-user conversation-preference update sent to
 * `PUT /user-preferences/conversations/{id}` (gateway `conversation-preferences`
 * route). Null fields are omitted so each call patches only what changed.
 */
@Serializable
data class ConversationPreferencesUpdate(
    val isPinned: Boolean? = null,
    val isMuted: Boolean? = null,
    val isArchived: Boolean? = null,
    val mentionsOnly: Boolean? = null,
    val categoryId: String? = null,
    val customName: String? = null,
    val reaction: String? = null,
    val tags: List<String>? = null,
)

/**
 * Body of `PATCH /conversations/{id}/participants/{userId}/role`. The gateway
 * enumerates `admin | moderator | member` and lowercases whatever it receives.
 */
@Serializable
data class ParticipantRoleUpdate(val role: String)

/** Body of `POST /conversations/{id}/participants` (add a member). */
@Serializable
data class AddParticipantRequest(val userId: String)

interface ConversationApi {
    @GET("conversations")
    suspend fun list(
        @Query("offset") offset: Int? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiConversation>>

    @GET("conversations/{id}")
    suspend fun getById(@Path("id") id: String): ApiResponse<ApiConversation>

    /** Aggregated message statistics for the conversation dashboard — gateway `conversations/stats.ts`. */
    @GET("conversations/{id}/stats")
    suspend fun stats(@Path("id") id: String): ApiResponse<ConversationMessageStatsResponse>

    /** AI conversation analysis (summary / health / participant personas) — gateway `conversations/analysis`. */
    @GET("conversations/{id}/analysis")
    suspend fun analysis(@Path("id") id: String): ApiResponse<ConversationAnalysis>

    /** Recherche par titre OU par nom de participant — gateway `conversations/search.ts`. */
    @GET("conversations/search")
    suspend fun search(@Query("q") query: String): ApiResponse<List<ApiConversation>>

    @POST("conversations")
    suspend fun create(@Body body: CreateConversationRequest): ApiResponse<ApiConversation>

    // Empty-body POST (no @Body — like markRead): the gateway derives the joiner
    // from the JWT. Idempotent server-side (routes/conversations/sharing.ts
    // resolveConversationEntry): an existing member gets the same canonical
    // conversationId as a fresh join, so callers never pre-check membership.
    @POST("conversations/join/{linkId}")
    suspend fun joinViaShareLink(@Path("linkId") linkId: String): ApiResponse<JoinAuthenticatedResponse>

    // POST, jamais PATCH : le gateway n'enregistre ce chemin qu'en POST
    // (routes/message-read-status.ts /mark-as-read + alias /read). Le PATCH
    // historique répondait 404 en silence — l'outbox épuisait ses tentatives
    // et les badges ne se vidaient jamais durablement.
    @POST("conversations/{id}/mark-as-read")
    suspend fun markRead(@Path("id") id: String): ApiResponse<Unit>

    // POST /conversations/{id}/mark-unread (gateway routes/conversations/messages.ts):
    // moves the read cursor back before the latest message so the conversation
    // reappears with 1 unread message. Distinct route from markRead's — the
    // gateway never registered a symmetric "mark-as-unread" alias.
    @POST("conversations/{id}/mark-unread")
    suspend fun markUnread(@Path("id") id: String): ApiResponse<Unit>

    @PUT("user-preferences/conversations/{id}")
    suspend fun updatePreferences(
        @Path("id") id: String,
        @Body body: ConversationPreferencesUpdate,
    ): ApiResponse<Unit>

    /**
     * Admin conversation-settings patch (write-role / announcement / slow-mode /
     * auto-translate) sent to `PUT /conversations/{id}`. Null body fields are
     * omitted so only changed settings are persisted.
     */
    @PUT("conversations/{id}")
    suspend fun updateSettings(
        @Path("id") id: String,
        @Body body: UpdateConversationSettingsRequest,
    ): ApiResponse<UpdateConversationResponse>

    /** Leaves the conversation (gateway `routes/conversations/leave.ts`) — irreversible for the
     *  caller; the row drops from their own list once `conversation:participant-left` round-trips. */
    @POST("conversations/{id}/leave")
    suspend fun leave(@Path("id") id: String): ApiResponse<Unit>

    /**
     * Permanently hides the conversation for the caller only (gateway
     * `routes/conversations/delete-for-me.ts`) — other participants are never
     * notified; the row drops from the caller's own devices once
     * `conversation:deleted` round-trips.
     */
    @DELETE("conversations/{id}/delete-for-me")
    suspend fun deleteForMe(@Path("id") id: String): ApiResponse<Unit>

    /**
     * Deletes the conversation for EVERY participant (gateway `routes/conversations/
     * core.ts`, `DELETE /conversations/:id` — "requires creator role", enforced
     * server-side; the client only gates the affordance). Distinct from
     * [deleteForMe]: this ends the conversation for the whole roster, not just
     * the caller.
     */
    @DELETE("conversations/{id}")
    suspend fun deleteForAll(@Path("id") id: String): ApiResponse<Unit>

    /**
     * One cursor page of the conversation's member roster (gateway
     * `routes/conversations/participants.ts`). Deliberately NOT typed as
     * [ApiResponse]: this route answers with a root-level cursor `pagination`
     * object (`nextCursor`/`hasMore`/`totalCount`) that the shared envelope's
     * offset-shaped [me.meeshy.sdk.model.Pagination] cannot express — the gateway's
     * own comment records that migrating it would be a breaking change for iOS and
     * web alike.
     *
     * [search] filters server-side on `displayName` (case-insensitive contains).
     */
    @GET("conversations/{id}/participants")
    suspend fun participants(
        @Path("id") id: String,
        @Query("search") search: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("cursor") cursor: String? = null,
    ): PaginatedParticipantsResponse

    /**
     * Promotes or demotes a member (gateway "requires creator or admin role",
     * enforced server-side — the client only gates the affordance via
     * [me.meeshy.sdk.model.MemberModeration]). The role travels lowercase; use
     * [me.meeshy.sdk.model.MemberRole.wireValue] rather than hand-writing it.
     */
    @PATCH("conversations/{id}/participants/{userId}/role")
    suspend fun updateParticipantRole(
        @Path("id") id: String,
        @Path("userId") userId: String,
        @Body body: ParticipantRoleUpdate,
    ): ApiResponse<Unit>

    /**
     * Removes a member from the conversation (gateway "requires admin/moderator
     * role or self-removal"). Self-removal goes through [leave] instead, which is
     * the affordance the UI offers for oneself.
     */
    @DELETE("conversations/{id}/participants/{userId}")
    suspend fun removeParticipant(
        @Path("id") id: String,
        @Path("userId") userId: String,
    ): ApiResponse<Unit>

    /**
     * Adds a member to the conversation (gateway "requires admin/moderator role" —
     * the client only gates the affordance, the server remains the authority).
     * Mirror of iOS `AddParticipantSheet.addParticipant`.
     */
    @POST("conversations/{id}/participants")
    suspend fun addParticipant(
        @Path("id") id: String,
        @Body body: AddParticipantRequest,
    ): ApiResponse<Unit>

    /**
     * Bans a member from the conversation — server-enforced (the client only gates the
     * affordance via [me.meeshy.sdk.model.MemberModeration.canBan]). Mirror of iOS
     * `ConversationService.banParticipant` (`packages/MeeshySDK`), itself the only iOS
     * surface that wires ban — `PATCH`, no body, path params only.
     */
    @PATCH("conversations/{id}/participants/{userId}/ban")
    suspend fun banParticipant(
        @Path("id") id: String,
        @Path("userId") userId: String,
    ): ApiResponse<Unit>

    /**
     * La fiche d'UN participant — identité, capacités d'entrée, réglages du lien
     * emprunté et octroi d'historique (#3943, port Android de ce que iOS et web
     * rendent depuis #3877).
     *
     * **Le segment porte un `Participant.id`, pas un `User.id`** : le sujet de
     * cette route est souvent un visiteur venu par un lien partagé, qui n'a
     * aucune ligne `User`. Les routes voisines de cette même interface nomment
     * leur paramètre `userId` et visent l'autre colonne — la ressemblance des
     * deux chemins est un piège, pas une symétrie.
     *
     * Le gateway décide seul de ce qu'il sert : `email`, `birthday`, `entryLink`
     * et `historyVisibleFrom` reviennent `null` à qui n'est pas hôte. Rien n'est
     * re-filtré ici.
     */
    @GET("conversations/{id}/participants/{participantId}/profile")
    suspend fun participantProfile(
        @Path("id") id: String,
        @Path("participantId") participantId: String,
    ): ApiResponse<ApiParticipantProfile>

    /**
     * Pose ou retire « voit l'historique depuis le \<date\> » sur un participant.
     *
     * Réservé aux admin/creator de la conversation — le serveur tranche, le
     * client ne fait que gater l'affordance sur `canGrantHistory`. `null`
     * explicite RETIRE l'octroi ; la clé absente ne dirait rien, et le gateway
     * distingue les deux (cf. [HistoryGrantUpdate]).
     */
    @PATCH("conversations/{id}/participants/{participantId}/rights")
    suspend fun updateHistoryGrant(
        @Path("id") id: String,
        @Path("participantId") participantId: String,
        @Body body: HistoryGrantUpdate,
    ): ApiResponse<ParticipantRightsUpdateResult>
}

/**
 * Ce que rend `PATCH …/rights` : l'état résolu après écriture, jamais le delta
 * envoyé. Tous les champs ont un défaut — un modèle plus strict que le fil ne
 * rendrait pas une réponse incomplète, il ne rendrait rien.
 */
@Serializable
data class ParticipantRightsUpdateResult(
    val participantId: String? = null,
    val conversationId: String? = null,
    val historyVisibleFrom: String? = null,
    val rights: me.meeshy.sdk.model.ParticipantEntryCapabilities? = null,
)
