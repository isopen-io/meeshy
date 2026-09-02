package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ChangeEmailRequest
import me.meeshy.sdk.model.ChangeEmailResponse
import me.meeshy.sdk.model.ChangePasswordRequest
import me.meeshy.sdk.model.ChangePasswordResponse
import me.meeshy.sdk.model.ChangePhoneRequest
import me.meeshy.sdk.model.ChangePhoneResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.TimelinePoint
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.UpdateProfileResponse
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.VerifyEmailChangeRequest
import me.meeshy.sdk.model.VerifyEmailChangeResponse
import me.meeshy.sdk.model.VerifyPhoneChangeRequest
import me.meeshy.sdk.model.VerifyPhoneChangeResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** A user search result — port of UserSearchResult (ServiceModels.swift). */
@Serializable
data class UserSearchResult(
    val id: String,
    val username: String = "",
    val displayName: String? = null,
    val avatar: String? = null,
    val isOnline: Boolean? = null,
)

/** Avatar update body — port of UserService.updateAvatar inline body. */
@Serializable
data class UpdateAvatarRequest(
    val avatar: String,
)

/** Banner update body — port of UserService.updateBanner inline body. */
@Serializable
data class UpdateBannerRequest(
    val banner: String,
)

/**
 * Body for `POST /me/account/deletion` (`routes/me/delete-account.ts`,
 * `OpenAccountDeletionBodySchema`) — the modern deletion-request route (#4183, #4799).
 * Unlike the legacy `DELETE /me/delete-account` route (kept gateway-side for older
 * installed clients, no longer bound here), it requires the caller's CURRENT
 * password: a stolen JWT alone can no longer open a deletion request.
 * [confirmationPhrase] still carries the literal
 * `me.meeshy.sdk.model.AccountDeletionConfirmation.REQUIRED_PHRASE`.
 */
@Serializable
data class OpenAccountDeletionRequest(
    val confirmationPhrase: String,
    val currentPassword: String,
)

@Serializable
data class AccountDeletionOpenedResponse(
    val message: String = "",
    /** ISO-8601 — the confirmation link's expiry. Kept as the raw wire string; no
     *  client-side countdown in this lot. */
    val tokenExpiresAt: String? = null,
)

interface UserApi {
    @GET("users/search")
    suspend fun search(
        @Query("q") query: String,
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
    ): ApiResponse<List<UserSearchResult>>

    @PATCH("users/me")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): ApiResponse<UpdateProfileResponse>

    @PATCH("users/me/avatar")
    suspend fun updateAvatar(@Body body: UpdateAvatarRequest): ApiResponse<UpdateProfileResponse>

    @PATCH("users/me/banner")
    suspend fun updateBanner(@Body body: UpdateBannerRequest): ApiResponse<UpdateProfileResponse>

    /**
     * LE profil public, a UNE adresse — `GET /directory/people/:handle` (#4161, #4250).
     *
     * ## Ce que cette methode remplace, et ce que l'inventaire manquant coutait
     *
     * Android appelait TROIS alias de cette meme route : `users/{idOrUsername}`
     * (l'ouverture de profil, seule reellement branchee), `u/{username}` et
     * `users/id/{id}` (deux jumelles mortes). Le commentaire qui garde ces alias
     * cote passerelle ne parle que des « versions iOS installees » — Android n'a
     * ete compte par aucun audit du chantier. Retirer les alias sur cet
     * inventaire a trois clients aurait coupe l'ouverture de profil sur Android,
     * y compris depuis un lien partage `meeshy://u/<pseudo>`, dont la queue de
     * versions installees est longue.
     *
     * ## `expand=presence` n'est pas un confort : c'est ce qui evite une PERTE SILENCIEUSE
     *
     * La route canonique SUPPRIME `isOnline` et `lastActiveAt` par defaut, la ou
     * les trois alias les servaient. Migrer sans ce parametre n'aurait produit
     * aucune erreur de decodage — `MeeshyUser` porte les deux champs en
     * nullable — mais `ProfileHeaderPresentation.from` aurait lu deux absents,
     * `isOnline == true` aurait valu faux pour tout le monde, et la pastille de
     * presence aurait disparu de chaque profil consulte, avec la ligne « vu il y
     * a X ». Une regression qu'aucun temoin de decodage ne peut voir : le
     * document decode parfaitement, il est seulement plus pauvre.
     *
     * Le parametre ne LEVE aucune garde. `servirProfilPublic` a deja applique la
     * loi de visibilite du 2026-08-25 quand il compose la charge ; `expand`
     * decide seulement si l'on POSE la question. Un lecteur non-ami recoit donc
     * toujours l'absence, et le client ne fabrique rien : pas de champ, pas de
     * pastille.
     *
     * ## Le decodage, champ par champ
     *
     * Le modele Kotlin est plus STRICT que le fil — un champ inconnu ou un champ
     * requis absent fait echouer le document ENTIER (kotlinx), la ou le decodeur
     * Swift tolere. Trois proprietes du `Json` de [me.meeshy.sdk.net.MeeshyApi]
     * tiennent ensemble ce contrat, et il n'en faut pas moins :
     * `ignoreUnknownKeys` absorbe les quatre champs de voix que la route sert et
     * que `MeeshyUser` ignore (`voicePublic`, `voiceSampleUrl`,
     * `voiceSampleDurationMs`, `voiceQuality`) plus les trois blocs d'expansion
     * (`stats`, `relation`, `isSelf`) ; les valeurs par defaut absorbent les
     * dix-huit champs que le profil public ne sert plus depuis #4161 ;
     * `explicitNulls = false` absorbe les nuls. Restent `id` et `username`, les
     * deux SEULES proprietes sans defaut de `MeeshyUser` — donc les deux seules
     * dont l'absence casserait tout, et la route les sert toujours.
     *
     * [handle] accepte un ObjectId ou un pseudo : c'est la detection de
     * `/users/:id` (`isValidObjectId`), inchangee. Aucune resolution nouvelle
     * n'est donc a faire ici — un lien de partage se transmet verbatim.
     *
     * [expand] a une valeur par defaut, et c'est delibere : laisser le choix a
     * chaque site d'appel rendrait la perte silencieuse ci-dessus reproductible
     * par simple oubli.
     */
    @GET("directory/people/{handle}")
    suspend fun getPerson(
        @Path("handle") handle: String,
        @Query("expand") expand: String = "presence",
    ): ApiResponse<MeeshyUser>

    @GET("users/email/{email}")
    suspend fun getProfileByEmail(@Path("email") email: String): ApiResponse<MeeshyUser>

    @GET("users/phone/{phone}")
    suspend fun getProfileByPhone(@Path("phone") phone: String): ApiResponse<MeeshyUser>

    @POST("users/me/change-email")
    suspend fun changeEmail(@Body body: ChangeEmailRequest): ApiResponse<ChangeEmailResponse>

    @POST("users/me/verify-email-change")
    suspend fun verifyEmailChange(
        @Body body: VerifyEmailChangeRequest,
    ): ApiResponse<VerifyEmailChangeResponse>

    @POST("users/me/resend-email-change-verification")
    suspend fun resendEmailChangeVerification(): ApiResponse<ChangeEmailResponse>

    @PATCH("users/me/password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): ApiResponse<ChangePasswordResponse>

    /**
     * `POST /api/v1/me/account/deletion` (routes/me/delete-account.ts) — the modern
     * deletion-request route requiring the current password (#4183, #4799). The
     * legacy `DELETE /api/v1/me/delete-account` route stays registered gateway-side
     * for older installed clients, but this app no longer calls it.
     */
    @POST("me/account/deletion")
    suspend fun openAccountDeletion(
        @Body body: OpenAccountDeletionRequest,
    ): ApiResponse<AccountDeletionOpenedResponse>

    @POST("users/me/change-phone")
    suspend fun changePhone(@Body body: ChangePhoneRequest): ApiResponse<ChangePhoneResponse>

    @POST("users/me/verify-phone-change")
    suspend fun verifyPhoneChange(
        @Body body: VerifyPhoneChangeRequest,
    ): ApiResponse<VerifyPhoneChangeResponse>

    @GET("users/{userId}/stats")
    suspend fun getUserStats(@Path("userId") userId: String): ApiResponse<UserStats>

    @GET("users/me/stats/timeline")
    suspend fun getUserStatsTimeline(@Query("days") days: Int): ApiResponse<List<TimelinePoint>>
}
