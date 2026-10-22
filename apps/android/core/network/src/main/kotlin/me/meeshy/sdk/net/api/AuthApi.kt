package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.AvailabilityResult
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.MeEnvelope
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.RegisterResponse
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.LoginResponse
import me.meeshy.sdk.model.auth.MeSecurityEnvelope
import me.meeshy.sdk.model.auth.PhoneRecoveryCodeData
import me.meeshy.sdk.model.auth.PhoneRecoveryCodeRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryIdentityData
import me.meeshy.sdk.model.auth.PhoneRecoveryIdentityRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryLookupData
import me.meeshy.sdk.model.auth.PhoneRecoveryLookupRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryResendRequest
import me.meeshy.sdk.model.auth.ResendVerificationRequest
import me.meeshy.sdk.model.auth.ResetPasswordRequest
import me.meeshy.sdk.model.auth.ResetTokenVerification
import me.meeshy.sdk.model.auth.ResetTokenVerificationRequest
import me.meeshy.sdk.model.auth.SendPhoneCodeRequest
import me.meeshy.sdk.model.auth.TwoFactorLoginRequest
import me.meeshy.sdk.model.auth.TwoFactorVerifyResult
import me.meeshy.sdk.model.auth.VerificationStatusData
import me.meeshy.sdk.model.auth.VerificationStatusRequest
import me.meeshy.sdk.model.auth.VerifyPhoneData
import me.meeshy.sdk.model.auth.VerifyPhoneRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Corps de POST auth/forgot-password — le gateway repond toujours succes (anti-enumeration). */
@Serializable
data class ForgotPasswordRequest(
    val email: String,
)

/**
 * Corps de POST auth/magic-link/request.
 *
 * [deviceFingerprint] et [linkDeviceHash] (#10872) lient le lien a l'appareil qui
 * l'a demande : l'appareil garde un secret et n'envoie que son EMPREINTE ; a
 * l'ouverture du lien il presente le secret. Omis du corps quand ils sont nuls
 * (`explicitNulls = false`) — une passerelle anterieure les ignore.
 */
@Serializable
data class MagicLinkRequestBody(
    val email: String,
    val rememberDevice: Boolean = false,
    val deviceFingerprint: String? = null,
    val linkDeviceHash: String? = null,
)

/**
 * Reponse de la demande de magic link — la duree seed le compte a rebours UI.
 * [pendingSessionToken] (#8083) est le jeton d'attente de CET appareil, servi par
 * la porte « e-mail seul » : il alimente `POST /auth/verification/status`.
 */
@Serializable
data class MagicLinkRequestData(
    val expiresInSeconds: Int? = null,
    val pendingSessionToken: String? = null,
)

/** Une session active du compte — sous-ensemble utile de GET auth/sessions. */
@Serializable
data class ActiveSessionInfo(
    val id: String,
    val deviceType: String? = null,
    val deviceVendor: String? = null,
    val deviceModel: String? = null,
    val osName: String? = null,
    val osVersion: String? = null,
    val browserName: String? = null,
    val isMobile: Boolean? = null,
    val ipAddress: String? = null,
    val country: String? = null,
    val city: String? = null,
    val createdAt: String? = null,
    val lastActivityAt: String? = null,
    val isCurrentSession: Boolean = false,
)

/** Enveloppe data de GET auth/sessions. */
@Serializable
data class SessionsListData(
    val sessions: List<ActiveSessionInfo> = emptyList(),
    val totalCount: Int = 0,
)

/**
 * Corps de POST auth/magic-link/validate.
 *
 * [linkDeviceSecret] est le secret garde a la demande et [confirm] le « oui »
 * explicite de l'utilisateur au compte que le lien ouvre (#10872) ; tous deux
 * omis du corps quand ils sont nuls.
 */
@Serializable
data class MagicLinkValidateRequest(
    val token: String,
    val linkDeviceSecret: String? = null,
    val confirm: Boolean? = null,
)

/** Reponse de GET auth/2fa/status. */
@Serializable
data class TwoFactorStatusInfo(
    val enabled: Boolean = false,
    val enabledAt: String? = null,
    val hasBackupCodes: Boolean = false,
    val backupCodesCount: Int = 0,
)

/** Reponse de POST auth/2fa/setup — QR code + secret d'un enrolement en cours. */
@Serializable
data class TwoFactorSetupInfo(
    val secret: String,
    val qrCodeDataUrl: String,
    val otpauthUrl: String,
)

/** Reponse de POST auth/2fa/enable et auth/2fa/backup-codes. */
@Serializable
data class TwoFactorBackupCodesInfo(
    val message: String = "",
    val backupCodes: List<String> = emptyList(),
)

/** Corps de POST auth/2fa/enable et auth/2fa/backup-codes (regeneration). */
@Serializable
data class TwoFactorCodeRequest(
    val code: String,
)

/** Corps de POST auth/2fa/disable. */
@Serializable
data class TwoFactorDisableRequest(
    val password: String,
    val code: String? = null,
)

interface AuthApi {
    /**
     * `200` sert QUATRE charges — la session, le defi de second facteur, l'adresse a
     * prouver, la confirmation du compte d'un lien — d'ou [LoginResponse], lue en
     * tolerance, et non [AuthSession] qui exige `user` et `token`.
     */
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): ApiResponse<LoginResponse>

    /** Seconde etape de la connexion d'un compte protege : le defi rendu par [login] et le code. */
    @POST("auth/login/2fa")
    suspend fun completeLoginWith2FA(@Body body: TwoFactorLoginRequest): ApiResponse<LoginResponse>

    /** Prouve l'adresse (code ou jeton de lien) ET ouvre la session, sous la forme de [login]. */
    @POST("auth/verify-email")
    suspend fun verifyEmail(@Body body: EmailVerificationRequest): ApiResponse<LoginResponse>

    /** Renvoie le code / lien de verification ; la passerelle repond succes meme sans compte (anti-enumeration). */
    @POST("auth/resend-verification")
    suspend fun resendVerification(@Body body: ResendVerificationRequest): ApiResponse<Unit>

    /** L'adresse a-t-elle ete prouvee (ailleurs) depuis que CET appareil a recu son jeton d'attente ? Jamais une session. */
    @POST("auth/verification/status")
    suspend fun verificationStatus(@Body body: VerificationStatusRequest): ApiResponse<VerificationStatusData>

    /** Verdict d'un jeton de reinitialisation, sans le consommer — le jeton voyage dans le CORPS (#10859). */
    @POST("auth/reset-password/verify-token")
    suspend fun verifyResetToken(@Body body: ResetTokenVerificationRequest): ApiResponse<ResetTokenVerification>

    @POST("auth/reset-password")
    suspend fun resetPassword(@Body body: ResetPasswordRequest): ApiResponse<Unit>

    /** Recuperation par telephone, etape 1 : retrouve le compte, masque. */
    @POST("auth/forgot-password/phone/lookup")
    suspend fun phoneRecoveryLookup(@Body body: PhoneRecoveryLookupRequest): ApiResponse<PhoneRecoveryLookupData>

    /** Recuperation par telephone, etape 2 : pseudo + adresse complets, qui declenchent le SMS. */
    @POST("auth/forgot-password/phone/verify-identity")
    suspend fun phoneRecoveryVerifyIdentity(@Body body: PhoneRecoveryIdentityRequest): ApiResponse<PhoneRecoveryIdentityData>

    /** Recuperation par telephone, etape 3 : le code SMS, qui rend le jeton de reinitialisation. */
    @POST("auth/forgot-password/phone/verify-code")
    suspend fun phoneRecoveryVerifyCode(@Body body: PhoneRecoveryCodeRequest): ApiResponse<PhoneRecoveryCodeData>

    /** Renvoie le SMS de la recuperation (une fois par minute). */
    @POST("auth/forgot-password/phone/resend")
    suspend fun phoneRecoveryResend(@Body body: PhoneRecoveryResendRequest): ApiResponse<Unit>

    @POST("auth/send-phone-code")
    suspend fun sendPhoneCode(@Body body: SendPhoneCodeRequest): ApiResponse<Unit>

    @POST("auth/verify-phone")
    suspend fun verifyPhone(@Body body: VerifyPhoneRequest): ApiResponse<VerifyPhoneData>

    /**
     * Ferme la session de [authorization] cote passerelle. Les jetons sont ceux
     * FIGES de la session quittee, passes explicitement : a l'instant de l'appel le
     * porte-jetons est deja vide, ou habite par le compte suivant, et `AuthInterceptor`
     * laisse intacte une requete qui porte deja son identite. Un 401 est rendu tel quel.
     */
    @POST("auth/logout")
    suspend fun logout(
        @Header("Authorization") authorization: String?,
        @Header("X-Session-Token") sessionToken: String? = null,
    ): ApiResponse<Unit>

    /** Un code de second facteur (TOTP ou de secours) a verifier ; un 401 y est un code refuse, jamais une session expiree. */
    @POST("auth/2fa/verify")
    suspend fun verifyTwoFactor(@Body body: TwoFactorCodeRequest): ApiResponse<TwoFactorVerifyResult>

    /** Annule un enrolement 2FA en cours (avant `enable`). */
    @POST("auth/2fa/cancel")
    suspend fun cancelTwoFactorSetup(): ApiResponse<Unit>

    /**
     * `GET auth/me?fields=id&expand=security` — le seul resume de securite dont
     * l'ecran du mot de passe a besoin (`security.hasPassword`, #9186), sans payer
     * le profil complet.
     */
    @GET("auth/me")
    suspend fun meSecurity(
        @Query("fields") fields: String = "id",
        @Query("expand") expand: String = "security",
    ): ApiResponse<MeSecurityEnvelope>

    /**
     * `200` sert DEUX charges — le compte créé, ou le conflit de numéro qui
     * n'en a créé aucun — d'où [RegisterResponse] et non [AuthSession] : cette
     * dernière exige `user` et `token`, que la branche conflit ne porte pas, et
     * la réponse échouait à la désérialisation au lieu d'être lue.
     */
    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): ApiResponse<RegisterResponse>

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshTokenRequest): ApiResponse<AuthSession>

    @GET("auth/me")
    suspend fun me(): ApiResponse<MeEnvelope>

    /**
     * Probe whether a username / email / phone is free before submitting the
     * registration wizard. Retrofit omits any `null` query parameter, so a
     * single-field probe hits `?username=…` alone. Parity with the gateway
     * `GET /auth/check-availability` endpoint.
     */
    @GET("auth/check-availability")
    suspend fun checkAvailability(
        @Query("username") username: String? = null,
        @Query("email") email: String? = null,
        @Query("phoneNumber") phoneNumber: String? = null,
    ): ApiResponse<AvailabilityResult>

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): ApiResponse<Unit>

    @POST("auth/magic-link/request")
    suspend fun requestMagicLink(@Body body: MagicLinkRequestBody): ApiResponse<MagicLinkRequestData>

    @GET("auth/sessions")
    suspend fun listSessions(): ApiResponse<SessionsListData>

    @DELETE("auth/sessions/{id}")
    suspend fun revokeSession(@Path("id") sessionId: String): ApiResponse<Unit>

    @DELETE("auth/sessions")
    suspend fun revokeOtherSessions(): ApiResponse<Unit>

    /** Meme charge que [login] : un lien ouvert ailleurs que sur l'appareil demandeur rend `requiresConfirmation`, sans session. */
    @POST("auth/magic-link/validate")
    suspend fun validateMagicLink(@Body body: MagicLinkValidateRequest): ApiResponse<LoginResponse>

    @GET("auth/2fa/status")
    suspend fun getTwoFactorStatus(): ApiResponse<TwoFactorStatusInfo>

    @POST("auth/2fa/setup")
    suspend fun beginTwoFactorSetup(): ApiResponse<TwoFactorSetupInfo>

    @POST("auth/2fa/enable")
    suspend fun enableTwoFactor(@Body body: TwoFactorCodeRequest): ApiResponse<TwoFactorBackupCodesInfo>

    @POST("auth/2fa/disable")
    suspend fun disableTwoFactor(@Body body: TwoFactorDisableRequest): ApiResponse<Unit>

    @POST("auth/2fa/backup-codes")
    suspend fun regenerateTwoFactorBackupCodes(@Body body: TwoFactorCodeRequest): ApiResponse<TwoFactorBackupCodesInfo>
}
