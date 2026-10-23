package me.meeshy.sdk.auth

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.AvailabilityResult
import me.meeshy.sdk.model.LoginRequest
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.EmailVerificationWatchStatus
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.LoginResponse
import me.meeshy.sdk.model.auth.ResendVerificationRequest
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.model.auth.ResetPasswordRequest
import me.meeshy.sdk.model.auth.ResetTokenVerification
import me.meeshy.sdk.model.auth.ResetTokenVerificationRequest
import me.meeshy.sdk.model.auth.SendPhoneCodeRequest
import me.meeshy.sdk.model.auth.TwoFactorLoginRequest
import me.meeshy.sdk.model.auth.TwoFactorVerifyResult
import me.meeshy.sdk.model.auth.VerificationStatusRequest
import me.meeshy.sdk.model.auth.VerifyPhoneData
import me.meeshy.sdk.model.auth.VerifyPhoneRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.sync.SyncSeqTracker
import javax.inject.Inject
import javax.inject.Singleton

/** Authentication use cases — owns persisting tokens and the session on login/register. */
@Singleton
class AuthRepository @Inject constructor(
    private val authApi: AuthApi,
    private val tokenStore: TokenStore,
    private val sessionRepository: SessionRepository,
    private val sessionTeardown: SessionTeardown,
    private val syncSeqTracker: SyncSeqTracker,
) {
    val isAuthenticated: Boolean get() = tokenStore.isAuthenticated

    /**
     * La connexion par mot de passe, dans TOUTES ses issues : la session, le défi
     * de second facteur, l'adresse à prouver, la confirmation d'un compte
     * ([LoginOutcome]). La session n'est stockée que sur [LoginOutcome.Authenticated] —
     * les trois autres ne donnent aucun accès, donc rien n'est écrit dans le
     * porte-jetons. Une charge illisible (statut inconnu, charge vide) est un échec
     * typé [AuthFailureCode.UNSUPPORTED_RESPONSE], jamais une session supposée.
     *
     * [rememberDevice] part toujours au corps : c'est lui qui fait durer la
     * confiance de l'appareil (365 jours) plutôt qu'un jour.
     */
    suspend fun loginOutcome(
        username: String,
        password: String,
        rememberDevice: Boolean,
    ): NetworkResult<LoginOutcome> =
        when (val result = apiCall { authApi.login(LoginRequest(username, password, rememberDevice)) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> result.data.openIfAuthenticated(typedIdentifier = username)
        }

    /**
     * La porte de l'écran de connexion actuel : une session ou un échec. Toute autre
     * issue de [loginOutcome] devient un échec typé ([AuthFailureCode]) — l'écran
     * qui sait les lire appelle [loginOutcome]. Le comportement reste celui d'avant :
     * session stockée sur succès, rien sinon, `rememberDevice = false` (la passerelle
     * n'accordait déjà que la durée de base quand la clé était omise).
     */
    suspend fun login(username: String, password: String): NetworkResult<AuthSession> =
        when (val result = loginOutcome(username, password, rememberDevice = false)) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> result.data.asSession()
        }

    /**
     * Seconde étape de la connexion d'un compte protégé : le défi rendu par
     * [loginOutcome] ([LoginOutcome.TwoFactorRequired.twoFactorToken]) et le code
     * (TOTP, ou de secours `XXXX-XXXX`). La session n'est stockée qu'au succès ; un
     * refus (code invalide, trop de tentatives) remonte tel quel, avec le `code` de
     * la passerelle — un 401 de cette route est « code refusé », jamais une
     * session expirée.
     */
    suspend fun completeLoginWith2FA(twoFactorToken: String, code: String): NetworkResult<AuthSession> =
        when (val result = apiCall { authApi.completeLoginWith2FA(TwoFactorLoginRequest(twoFactorToken, code)) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> when (val opened = result.data.openIfAuthenticated()) {
                is NetworkResult.Failure -> opened
                is NetworkResult.Success -> opened.data.asSession()
            }
        }

    /**
     * Prouve l'adresse par le code ou le lien ([EmailVerificationRequest]) et rend ce
     * que la preuve a produit — la session, le défi de second facteur, ou la
     * confirmation d'un compte. Elle N'ADOPTE RIEN : l'écran qui attend le code tient
     * la session et la pose lui-même ([adoptSession]), sinon la racine de l'app
     * basculerait et démonterait l'écran en cours (#8288).
     */
    suspend fun confirmEmail(request: EmailVerificationRequest): NetworkResult<LoginOutcome> =
        when (val result = apiCall { authApi.verifyEmail(request) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> result.data.asOutcome(typedIdentifier = request.email)
        }

    /**
     * Ouvre une session que l'appelant a TENUE (preuve d'adresse, lien magique
     * confirmé) : jetons écrits, profil adopté. Publique pour les écrans d'ouverture
     * sur preuve ; elle ne vérifie rien — l'appelant ne la passe qu'à une session que
     * la passerelle vient de rendre.
     */
    fun adoptSession(session: AuthSession, origin: SessionOrigin = SessionOrigin.LOGIN) {
        storeSession(session, origin)
    }

    /**
     * Valide le lien magique SANS poser la session : l'ouverture passe par le
     * `ProvenSessionOpener` (fenêtre d'adoption, garde de changement de compte), jamais
     * par un stockage direct. Mêmes arguments et mêmes issues que [magicLinkOutcome].
     */
    suspend fun verifyMagicLink(
        token: String,
        linkDeviceSecret: String? = null,
        confirmed: Boolean = false,
    ): NetworkResult<LoginOutcome> =
        when (
            val result = apiCall {
                authApi.validateMagicLink(
                    me.meeshy.sdk.net.api.MagicLinkValidateRequest(
                        token = token,
                        linkDeviceSecret = linkDeviceSecret?.takeIf { it.isNotBlank() },
                        confirm = if (confirmed) true else null,
                    ),
                )
            }
        ) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> result.data.asOutcome()
        }

    /**
     * Ferme côté passerelle une session prouvée qu'on n'a pas posée (refusée, hors fenêtre,
     * écartée) : la preuve a consommé le jeton et ouvert une session serveur qui ne doit pas
     * lui survivre. Rien ne change sur l'appareil. `true` quand la passerelle a répondu.
     */
    suspend fun closeProvenServerSession(jwt: String, sessionToken: String?): Boolean =
        try {
            authApi.logout(authorization = "Bearer $jwt", sessionToken = sessionToken)
            true
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (ignored: Exception) {
            false
        }

    /**
     * Crée le compte. Le `200` de la passerelle porte DEUX issues distinctes —
     * le compte créé, ou le refus « ce numéro appartient déjà à quelqu'un »,
     * qui n'a créé aucun compte — donc le succès de transport ne suffit pas à
     * dire qu'on est inscrit : c'est [RegisterOutcome] qui le dit.
     *
     * La session n'est adoptée que sur [RegisterOutcome.Created] : un conflit
     * de numéro laisse le porte-jetons intact, faute de quoi l'app se croirait
     * connectée sans compte.
     */
    suspend fun register(request: RegisterRequest): NetworkResult<RegisterOutcome> =
        when (val result = apiCall { authApi.register(request) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> {
                val session = result.data.asSession()
                when {
                    result.data.phoneOwnershipConflict ->
                        NetworkResult.Success(RegisterOutcome.PhoneOwnershipConflict)
                    session != null -> {
                        storeSession(session)
                        NetworkResult.Success(RegisterOutcome.Created(session))
                    }
                    // Ni identité, ni conflit déclaré : la charge ne dit rien
                    // d'exploitable. Un échec explicite vaut mieux qu'un conflit
                    // supposé, qui enverrait l'utilisateur corriger un numéro
                    // que personne n'a mis en cause.
                    else -> NetworkResult.Failure(
                        ApiError(message = "Registration response carried no session", code = "PARSE"),
                    )
                }
            }
        }

    /**
     * Probe the availability of a single signup field (username / email / phone).
     * Pass exactly the one being checked; the others stay `null` and are omitted
     * from the request. A transport/HTTP failure folds into [NetworkResult.Failure]
     * so the caller can degrade to an "unknown" verdict rather than a stale answer.
     */
    suspend fun checkAvailability(
        username: String? = null,
        email: String? = null,
        phoneNumber: String? = null,
    ): NetworkResult<AvailabilityResult> =
        apiCall { authApi.checkAvailability(username, email, phoneNumber) }

    /**
     * Demande l'email de reinitialisation de mot de passe. Le gateway repond
     * TOUJOURS succes (anti-enumeration) : un echec ici est un probleme de
     * transport, jamais "cet email n'existe pas".
     */
    suspend fun requestPasswordReset(email: String): NetworkResult<Unit> =
        me.meeshy.sdk.net.apiCallUnit { authApi.forgotPassword(me.meeshy.sdk.net.api.ForgotPasswordRequest(email)) }

    /**
     * Demande un magic link de connexion sans mot de passe. Retourne la validite
     * du lien en secondes (seed du compte a rebours), avec un defaut prudent si le
     * gateway n'en renvoie pas.
     */
    suspend fun requestMagicLink(email: String): NetworkResult<Int> =
        apiCall { authApi.requestMagicLink(me.meeshy.sdk.net.api.MagicLinkRequestBody(email)) }
            .map { it.expiresInSeconds ?: DEFAULT_MAGIC_LINK_VALIDITY_SECONDS }

    /**
     * Echange le token du magic link contre une session complete — le pendant
     * passwordless de [login] : memes effets (tokens persistes, session hydratee).
     * L'appelant est responsable du logout PREALABLE si un compte est deja ouvert
     * (parite iOS P0 : un lien pour le compte B tape depuis le compte A doit
     * passer par un teardown complet, jamais par un simple remplacement).
     */
    suspend fun loginWithMagicLink(token: String): NetworkResult<AuthSession> =
        when (val result = magicLinkOutcome(token)) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> result.data.asSession()
        }

    /**
     * Le lien magique dans toutes ses issues. [linkDeviceSecret] est le secret que
     * l'appareil a gardé en demandant le lien et [confirmed] le « oui » de l'utilisateur
     * au compte qu'il ouvre (#10872) : un lien ouvert ailleurs que sur l'appareil
     * demandeur rend [LoginOutcome.LinkConfirmationRequired], sans session. La session
     * n'est stockée que sur [LoginOutcome.Authenticated].
     */
    suspend fun magicLinkOutcome(
        token: String,
        linkDeviceSecret: String? = null,
        confirmed: Boolean = false,
    ): NetworkResult<LoginOutcome> =
        when (
            val result = apiCall {
                authApi.validateMagicLink(
                    me.meeshy.sdk.net.api.MagicLinkValidateRequest(
                        token = token,
                        linkDeviceSecret = linkDeviceSecret?.takeIf { it.isNotBlank() },
                        confirm = if (confirmed) true else null,
                    ),
                )
            }
        ) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> result.data.openIfAuthenticated()
        }

    /** Renvoie le code / lien de vérification ; la passerelle répond succès même sans compte (anti-énumération). */
    suspend fun resendEmailVerification(email: String): NetworkResult<Unit> =
        me.meeshy.sdk.net.apiCallUnit { authApi.resendVerification(ResendVerificationRequest(email)) }

    /**
     * L'adresse a-t-elle été prouvée ailleurs depuis que CET appareil a reçu son jeton
     * d'attente ? Jamais une session. Un jeton inconnu (401) ou expiré (410) FINIT
     * l'attente ([EmailVerificationWatchStatus.ENDED]) ; toute autre panne reste un
     * échec passager, à rejouer.
     */
    suspend fun emailVerificationStatus(pendingSessionToken: String): NetworkResult<EmailVerificationWatchStatus> =
        when (val result = apiCall { authApi.verificationStatus(VerificationStatusRequest(pendingSessionToken)) }) {
            is NetworkResult.Success -> NetworkResult.Success(EmailVerificationWatchStatus.served(result.data.status))
            is NetworkResult.Failure ->
                EmailVerificationWatchStatus.ending(result.error.httpStatus)
                    ?.let { NetworkResult.Success(it) }
                    ?: result
        }

    /** Le verdict d'un jeton de réinitialisation, sans le consommer. */
    suspend fun verifyResetToken(token: String): NetworkResult<ResetTokenVerification> =
        apiCall { authApi.verifyResetToken(ResetTokenVerificationRequest(token)) }

    /**
     * Pose le nouveau mot de passe. [twoFactorCode] est celui d'un compte protégé (omis
     * sinon) ; les refus (`RESET_TOKEN_INVALID`, `TWO_FACTOR_REQUIRED`…) remontent avec
     * leur `code`.
     */
    suspend fun submitPasswordReset(
        token: String,
        newPassword: String,
        twoFactorCode: String? = null,
    ): NetworkResult<Unit> =
        me.meeshy.sdk.net.apiCallUnit {
            authApi.resetPassword(
                ResetPasswordRequest(
                    token = token,
                    newPassword = newPassword,
                    confirmPassword = newPassword,
                    twoFactorCode = twoFactorCode,
                ),
            )
        }

    /** Envoie le code SMS qui prouve un numéro. */
    suspend fun sendPhoneCode(phoneNumber: String): NetworkResult<Unit> =
        me.meeshy.sdk.net.apiCallUnit { authApi.sendPhoneCode(SendPhoneCodeRequest(phoneNumber)) }

    suspend fun verifyPhone(phoneNumber: String, code: String): NetworkResult<VerifyPhoneData> =
        apiCall { authApi.verifyPhone(VerifyPhoneRequest(phoneNumber, code)) }

    /**
     * Le compte a-t-il déjà un mot de passe ? Un compte né d'une inscription par e-mail
     * seul n'en a pas, et Réglages › Sécurité doit alors en POSER un sans réclamer
     * d'« actuel » (#9186). `Success(null)` quand la passerelle ne sert pas le résumé :
     * l'écran garde le formulaire d'un CHANGEMENT.
     */
    suspend fun hasPassword(): NetworkResult<Boolean?> =
        apiCall { authApi.meSecurity() }.map { it.user.security?.hasPassword }

    /** Vérifie un code de second facteur (TOTP ou de secours) ; un 401 est un code refusé. */
    suspend fun verifyTwoFactor(code: String): NetworkResult<TwoFactorVerifyResult> =
        apiCall { authApi.verifyTwoFactor(me.meeshy.sdk.net.api.TwoFactorCodeRequest(code)) }

    /** Annule un enrôlement 2FA en cours, avant `enable`. */
    suspend fun cancelTwoFactorSetup(): NetworkResult<Unit> =
        me.meeshy.sdk.net.apiCallUnit { authApi.cancelTwoFactorSetup() }

    /** Les sessions actives du compte (la courante marquee par le serveur). */
    suspend fun listSessions(): NetworkResult<me.meeshy.sdk.net.api.SessionsListData> =
        apiCall { authApi.listSessions() }

    /** Revoque UNE session (jamais la courante cote UI). */
    suspend fun revokeSession(sessionId: String): NetworkResult<Unit> =
        me.meeshy.sdk.net.apiCallUnit { authApi.revokeSession(sessionId) }

    /** Revoque toutes les sessions SAUF la courante. */
    suspend fun revokeOtherSessions(): NetworkResult<Unit> =
        me.meeshy.sdk.net.apiCallUnit { authApi.revokeOtherSessions() }

    /** Statut 2FA du compte (active/non, nombre de codes de secours restants). */
    suspend fun getTwoFactorStatus(): NetworkResult<me.meeshy.sdk.net.api.TwoFactorStatusInfo> =
        apiCall { authApi.getTwoFactorStatus() }

    /** Demarre un enrolement 2FA — QR code + secret a confirmer via [enableTwoFactor]. */
    suspend fun beginTwoFactorSetup(): NetworkResult<me.meeshy.sdk.net.api.TwoFactorSetupInfo> =
        apiCall { authApi.beginTwoFactorSetup() }

    /** Confirme l'enrolement avec le premier code TOTP — renvoie les codes de secours. */
    suspend fun enableTwoFactor(code: String): NetworkResult<me.meeshy.sdk.net.api.TwoFactorBackupCodesInfo> =
        apiCall { authApi.enableTwoFactor(me.meeshy.sdk.net.api.TwoFactorCodeRequest(code)) }

    /** Desactive le 2FA — mot de passe requis, code optionnel cote gateway. */
    suspend fun disableTwoFactor(password: String, code: String?): NetworkResult<Unit> =
        me.meeshy.sdk.net.apiCallUnit { authApi.disableTwoFactor(me.meeshy.sdk.net.api.TwoFactorDisableRequest(password, code)) }

    /** Regenere les codes de secours (invalide les anciens) — code TOTP requis. */
    suspend fun regenerateTwoFactorBackupCodes(code: String): NetworkResult<me.meeshy.sdk.net.api.TwoFactorBackupCodesInfo> =
        apiCall { authApi.regenerateTwoFactorBackupCodes(me.meeshy.sdk.net.api.TwoFactorCodeRequest(code)) }

    /** Re-hydrates the session on app start when a token is already present. */
    suspend fun restoreSession() {
        sessionRepository.refresh()
    }

    /**
     * Ends the session and wipes every per-account cache ([SessionTeardown]) so a
     * different account signing in on this device never inherits the previous
     * account's data. The wipe is awaited before returning — the caller may treat
     * the device as clean the moment this suspend call completes.
     *
     * La passerelle est ensuite prévenue, au mieux : `POST /auth/logout` part avec les
     * jetons FIGÉS de la session quittée, relevés AVANT la purge. Lus plus tard, ils
     * seraient vides — ou ceux du compte qui vient de se connecter, dont on fermerait
     * alors la session à la place de l'autre. La purge locale passe d'abord et ne
     * dépend de rien : hors ligne, en erreur ou après [SERVER_LOGOUT_TIMEOUT_MILLIS],
     * l'appareil est propre de toute façon, et la session passerelle expirera d'elle-même.
     */
    suspend fun logout() {
        val frozenJwt = tokenStore.jwt
        val frozenSessionToken = tokenStore.sessionToken
        tokenStore.clear()
        sessionRepository.clear()
        sessionTeardown.wipe()
        // Le curseur `_seq` est en MÉMOIRE, donc hors du périmètre de
        // [SessionTeardown] (stores persistés) — il se purge ici, comme iOS le
        // purge dans `AuthManager` et le web dans `disconnect()`. Il est alloué
        // PAR USER côté serveur : hérité, il ferait manquer au compte suivant
        // tous ses trous tant qu'il n'aurait pas dépassé la valeur du précédent.
        syncSeqTracker.reset()
        closeServerSession(frozenJwt, frozenSessionToken)
    }

    private suspend fun closeServerSession(jwt: String?, sessionToken: String?) {
        if (jwt == null && sessionToken == null) return
        withTimeoutOrNull(SERVER_LOGOUT_TIMEOUT_MILLIS) {
            try {
                authApi.logout(authorization = jwt?.let { "Bearer $it" }, sessionToken = sessionToken)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (ignored: Exception) {
                // Meilleur effort assumé : la purge locale a déjà eu lieu, et la
                // session passerelle expirera d'elle-même.
            }
        }
    }

    private fun LoginResponse.asOutcome(typedIdentifier: String = ""): NetworkResult<LoginOutcome> =
        outcome(typedIdentifier)
            ?.let { NetworkResult.Success(it) }
            ?: NetworkResult.Failure(AuthFailureCode.forNonSession(null))

    /** L'issue lue, et la session stockée si — et seulement si — c'est une session. */
    private fun LoginResponse.openIfAuthenticated(typedIdentifier: String = ""): NetworkResult<LoginOutcome> =
        asOutcome(typedIdentifier).also { result ->
            val outcome = (result as? NetworkResult.Success)?.data
            if (outcome is LoginOutcome.Authenticated) storeSession(outcome.session)
        }

    private fun LoginOutcome.asSession(): NetworkResult<AuthSession> = when (this) {
        is LoginOutcome.Authenticated -> NetworkResult.Success(session)
        else -> NetworkResult.Failure(AuthFailureCode.forNonSession(this))
    }

    private fun storeSession(session: AuthSession, origin: SessionOrigin = SessionOrigin.LOGIN) {
        tokenStore.jwt = session.token
        tokenStore.sessionToken = session.sessionToken
        sessionRepository.adopt(session.user, origin)
    }

    private companion object {
        /** Validite par defaut si le gateway omet expiresInSeconds (60 s cote serveur). */
        const val DEFAULT_MAGIC_LINK_VALIDITY_SECONDS: Int = 60

        /** Ce que la deconnexion attend la passerelle : au-dela, l'appareil est deja propre et rend la main. */
        const val SERVER_LOGOUT_TIMEOUT_MILLIS: Long = 3_000L
    }
}

/**
 * Ce que `POST /auth/register` a réellement produit.
 *
 * Deux issues sous le même `200` : le compte est créé, ou le numéro fourni
 * appartient déjà à un compte vérifié et **rien n'a été créé**. Les distinguer
 * par un type, et non par un booléen dans la charge, force chaque appelant à
 * traiter le refus — un `AuthSession` nullable se serait lu « échec réseau ».
 */
sealed interface RegisterOutcome {

    /** Le compte existe et la session est déjà adoptée. */
    data class Created(val session: AuthSession) : RegisterOutcome

    /** Le numéro est rattaché à un autre compte vérifié ; aucun compte créé. */
    data object PhoneOwnershipConflict : RegisterOutcome
}
