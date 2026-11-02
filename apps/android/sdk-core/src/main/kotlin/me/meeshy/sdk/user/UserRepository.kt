package me.meeshy.sdk.user

import me.meeshy.sdk.model.AccountDeletionStatus
import me.meeshy.sdk.model.Achievement
import me.meeshy.sdk.model.ChangeEmailRequest
import me.meeshy.sdk.model.ChangeEmailResponse
import me.meeshy.sdk.model.ChangePasswordRequest
import me.meeshy.sdk.model.ChangePasswordResponse
import me.meeshy.sdk.model.ChangePhoneRequest
import me.meeshy.sdk.model.ChangePhoneResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ProfileExpansion
import me.meeshy.sdk.model.PublicProfile
import me.meeshy.sdk.model.TimelinePoint
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.VerifyEmailChangeRequest
import me.meeshy.sdk.model.VerifyEmailChangeResponse
import me.meeshy.sdk.model.VerifyPhoneChangeRequest
import me.meeshy.sdk.model.VerifyPhoneChangeResponse
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.PagedResult
import me.meeshy.sdk.net.api.UpdateAvatarRequest
import me.meeshy.sdk.net.api.UpdateBannerRequest
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.pagedApiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.model.profile.ProfileEditDiff
import me.meeshy.sdk.session.PendingProfileEdits
import me.meeshy.sdk.session.SessionRepository
import kotlinx.coroutines.flow.first
import kotlinx.serialization.encodeToString
import javax.inject.Inject
import javax.inject.Singleton

/** User search, profile lookup and contact changes — port of UserService (UserService.swift). */
@Singleton
class UserRepository @Inject constructor(
    private val userApi: UserApi,
    private val sessionRepository: SessionRepository,
    private val outboxRepository: OutboxRepository,
) {
    suspend fun searchUsers(
        query: String,
        limit: Int = 20,
        offset: Int = 0,
    ): NetworkResult<List<UserSearchResult>> =
        apiCall { userApi.search(query, limit, offset) }

    /**
     * [searchUsers], but preserving the envelope's `pagination` block instead of
     * discarding it — for callers that need to offer "load more" (the "new
     * conversation" picker). A separate method rather than changing [searchUsers]'s
     * return type: three other call sites (`SuggestionsRepository`, `MentionSearch`,
     * `DiscoverViewModel`) only ever need the first page and have no use for
     * `hasMore`.
     */
    suspend fun searchUsersPaged(
        query: String,
        limit: Int = 20,
        offset: Int = 0,
    ): NetworkResult<PagedResult<List<UserSearchResult>>> =
        pagedApiCall { userApi.search(query, limit, offset) }

    suspend fun updateProfile(request: UpdateProfileRequest): NetworkResult<MeeshyUser> =
        apiCall { userApi.updateProfile(request) }.map { it.user }

    /**
     * Optimistically applies a profile edit to the session identity and queues its
     * durable delivery (ARCHITECTURE.md §5; ADR-006). The signed-in [MeeshyUser]
     * re-paints immediately via [SessionRepository.applyProfileEdit] (so every
     * surface observing the session shows the edit before the network answers) and
     * an `UPDATE_PROFILE` mutation carrying the full PATCH body joins the profile
     * lane — surviving offline and process death instead of an online-first REST
     * call a dropped connection would silently lose. The [OutboxFlushWorker]
     * delivers it (reconciling with the server-returned user, or reverting on a hard
     * exhaust) and the coalescer keeps only the latest row — so the edits still
     * PENDING are folded into the new one first ([ProfileEditDiff.combine]): a
     * request carries only the changed fields, and replacing an older one must
     * never drop a field it was the only one to carry. Inert with no session
     * (returns `null`, no optimistic flip). Surpasses iOS, whose edit is online-only.
     *
     * @return the queued row's `cmid`, or `null` when there is no active session or
     *   the enqueue was superseded — the caller uses a non-`null` result to decide
     *   whether to wake the flush worker.
     */
    suspend fun enqueueProfileEdit(request: UpdateProfileRequest): String? {
        val userId = sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        sessionRepository.applyProfileEdit(request)
        val queued = PendingProfileEdits.decode(
            rows = outboxRepository.deliverable(OutboxLanes.PROFILE),
            userId = userId,
            json = MeeshyApi.json,
            states = setOf(OutboxState.PENDING),
        )
        val merged = (queued + request).reduce(ProfileEditDiff::combine)
        return outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPDATE_PROFILE,
                lane = OutboxLanes.PROFILE,
                targetId = userId,
                payload = MeeshyApi.json.encodeToString(merged),
            ),
        )
    }

    /**
     * Suspends until the queued profile edit [cmid] reaches a terminal outcome and tells whether the
     * outbox ABANDONED it (exhausted: retries spent or refused) — the screen then restores its snapshot
     * and reopens the editor. Delivered, superseded by a newer edit or cancelled answers `false`.
     * Call it before waking the flush worker: the outcome stream does not replay.
     */
    suspend fun awaitProfileEditAbandoned(cmid: String): Boolean =
        outboxRepository.outcomes.first { it.cmid == cmid } is OutboxOutcome.Exhausted

    suspend fun updateAvatar(url: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.updateAvatar(UpdateAvatarRequest(url)) }.map { it.user }

    suspend fun updateBanner(url: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.updateBanner(UpdateBannerRequest(url)) }.map { it.user }

    /**
     * Lit UN profil public — identifiant ou pseudo, indifferemment (#4250).
     *
     * Trois methodes visaient ici trois ALIAS de la meme route de passerelle :
     * celle-ci (`users/{idOrUsername}`), `getPublicProfile` (`u/{username}`) et
     * `getProfileById` (`users/id/{id}`). Les deux dernieres n'avaient AUCUN
     * appelant dans l'application — ni ecran, ni cas d'usage — et repointer
     * trois noms sur `directory/people/{handle}` les aurait rendues
     * rigoureusement identiques : trois jumelles pour une seule regle, que la
     * prochaine main aurait fait diverger. Elles sont supprimees ; le nom qui
     * reste est celui que `ProfileViewModel.loadProfile` appelle deja.
     *
     * Le parametre s'appelle toujours `idOrUsername` parce que c'est ce que
     * l'appelant en sait : un lien de partage `meeshy://u/<pseudo>` et un
     * identifiant de navigation arrivent tous deux ici sans etre distingues.
     */
    suspend fun getProfile(idOrUsername: String): NetworkResult<MeeshyUser> =
        getPublicProfile(idOrUsername).map { it.user }

    /**
     * LA lecture d'un profil public en UN aller-retour : profil, statistiques et presence
     * (et la relation seulement si [expand] la demande). [getProfile] n'en est que la
     * projection. L'ordre de `expand` est stable pour que deux appels equivalents produisent
     * la meme requete.
     */
    suspend fun getPublicProfile(
        handle: String,
        expand: Set<ProfileExpansion> = ProfileExpansion.DEFAULT,
    ): NetworkResult<PublicProfile> =
        apiCall { userApi.getPublicProfile(handle, ProfileExpansion.query(expand)) }

    suspend fun getMyStats(): NetworkResult<UserStats> = apiCall { userApi.getMyStats() }

    suspend fun getMyAchievements(): NetworkResult<List<Achievement>> =
        apiCall { userApi.getMyAchievements() }

    suspend fun getAccountDeletionStatus(): NetworkResult<AccountDeletionStatus> =
        apiCall { userApi.getAccountDeletionStatus() }

    suspend fun getProfileByEmail(email: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.getProfileByEmail(email) }

    suspend fun getProfileByPhone(phone: String): NetworkResult<MeeshyUser> =
        apiCall { userApi.getProfileByPhone(phone.replace("+", "")) }

    suspend fun changeEmail(newEmail: String): NetworkResult<ChangeEmailResponse> =
        apiCall { userApi.changeEmail(ChangeEmailRequest(newEmail)) }

    suspend fun verifyEmailChange(token: String): NetworkResult<VerifyEmailChangeResponse> =
        apiCall { userApi.verifyEmailChange(VerifyEmailChangeRequest(token)) }

    suspend fun resendEmailChangeVerification(): NetworkResult<ChangeEmailResponse> =
        apiCall { userApi.resendEmailChangeVerification() }

    /**
     * Changes the signed-in user's password (`PATCH /users/me/password`). This is an
     * inherently *online* action — the gateway must verify the current password against
     * the stored hash, so it cannot be optimistic or offline-queued (unlike a profile
     * edit). A wrong current password comes back as an HTTP 400 in the folded
     * [NetworkResult.Failure] (`httpStatus == 400`), which the caller maps to a targeted
     * "incorrect current password" message; transport failures surface as `code == "NETWORK"`.
     */
    suspend fun changePassword(
        currentPassword: String,
        newPassword: String,
    ): NetworkResult<ChangePasswordResponse> =
        apiCall { userApi.changePassword(ChangePasswordRequest(currentPassword, newPassword)) }

    suspend fun changePhone(newPhoneNumber: String): NetworkResult<ChangePhoneResponse> =
        apiCall { userApi.changePhone(ChangePhoneRequest(newPhoneNumber)) }

    suspend fun verifyPhoneChange(code: String): NetworkResult<VerifyPhoneChangeResponse> =
        apiCall { userApi.verifyPhoneChange(VerifyPhoneChangeRequest(code)) }

    /**
     * Les statistiques de [userId]. Les siennes passent par `users/me/stats` — jamais
     * `users/{monId}/stats` ; un profil tiers lit les siennes dans [getPublicProfile]
     * (`expand=stats`), cette route n'etant gardee que pour les appelants non migres.
     */
    suspend fun getUserStats(userId: String): NetworkResult<UserStats> =
        if (userId == sessionRepository.currentUserId) getMyStats() else apiCall { userApi.getUserStats(userId) }

    /**
     * The signed-in user's daily message-activity timeline. This is a `me`-only
     * gateway endpoint (`/users/me/stats/timeline`) — it always reports the
     * caller's own activity, so it is never keyed by a viewed user id. [days] is
     * clamped to the gateway-accepted `7..90` window.
     */
    suspend fun getUserStatsTimeline(days: Int = 30): NetworkResult<List<TimelinePoint>> =
        apiCall { userApi.getUserStatsTimeline(days.coerceIn(7, 90)) }
}
