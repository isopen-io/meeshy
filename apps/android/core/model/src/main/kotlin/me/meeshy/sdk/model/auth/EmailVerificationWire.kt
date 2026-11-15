package me.meeshy.sdk.model.auth

import kotlinx.serialization.Serializable

/**
 * Corps de `POST /auth/verify-email` : l'adresse et UNE preuve — le code reçu
 * (six chiffres), ou le jeton du lien. Miroir de `EmailVerificationRequest`
 * (`packages/MeeshySDK/.../Auth/EmailVerificationModels.swift`).
 *
 * La passerelle refuse toute combinaison qui n'est pas l'une des deux formes
 * (`AuthSchemas.verifyEmail`) : on les construit donc par [code] et [link], pas
 * à la main.
 *
 * Le mot de passe ne voyage qu'avec le CODE (la passerelle l'ignore avec un
 * jeton et ne le pose que sur un compte qui n'en a pas) : un lien ouvert ne
 * connaît aucun mot de passe, et un champ vide n'en est pas un. De même,
 * [linkDeviceSecret] et [confirm] n'accompagnent que le LIEN (#10872) : omis du
 * corps quand ils sont nuls, une passerelle antérieure les ignore.
 */
@Serializable
data class EmailVerificationRequest(
    val email: String,
    val code: String? = null,
    val token: String? = null,
    val password: String? = null,
    val linkDeviceSecret: String? = null,
    val confirm: Boolean? = null,
) {

    /**
     * La même preuve, portant le secret de l'appareil qui a demandé le lien.
     * Jamais pour un code : sans jeton, la requête est rendue telle quelle.
     */
    fun presenting(linkDeviceSecret: String?): EmailVerificationRequest {
        if (token == null) return this
        return copy(linkDeviceSecret = linkDeviceSecret?.takeIf { it.isNotBlank() })
    }

    companion object {
        /** La preuve par le CODE ; [password] vide se lit absent. */
        fun code(code: String, email: String, password: String? = null): EmailVerificationRequest =
            EmailVerificationRequest(email = email, code = code, password = password?.takeIf { it.isNotEmpty() })

        /** La preuve par le LIEN ; [confirmed] est le « oui » explicite de l'utilisateur, `false` ne part pas. */
        fun link(token: String, email: String, confirmed: Boolean = false): EmailVerificationRequest =
            EmailVerificationRequest(email = email, token = token, confirm = if (confirmed) true else null)
    }
}

/** Corps de `POST /auth/resend-verification` — la passerelle répond succès même si le compte n'existe pas. */
@Serializable
data class ResendVerificationRequest(val email: String)

/** Corps de `POST /auth/verification/status` : le jeton d'attente de CET appareil (#8083). */
@Serializable
data class VerificationStatusRequest(val pendingSessionToken: String)

/** `data` de `POST /auth/verification/status` : `pending` | `proven`, jamais une session ni l'adresse. */
@Serializable
data class VerificationStatusData(
    @Serializable(with = TolerantStringSerializer::class) val status: String? = null,
)

/**
 * Ce que l'appareil qui attend son code sait de la preuve de son adresse (#8083).
 *
 * Cet état ne donne JAMAIS de session : le téléphone ne se connecte que par le
 * code saisi sur lui ou le lien ouvert sur lui. Il permet seulement à l'écran
 * du code de dire « adresse confirmée — saisissez le code reçu » quand le lien
 * a été ouvert ailleurs.
 */
enum class EmailVerificationWatchStatus {
    /** Rien de prouvé depuis que le code a été demandé. */
    PENDING,

    /** L'adresse a été prouvée (code ou lien, n'importe où). */
    PROVEN,

    /** Le jeton est inconnu (401) ou expiré (410) : il n'y a plus rien à attendre. */
    ENDED,
    ;

    companion object {
        /** L'état SERVI ; toute valeur inconnue se lit « rien de prouvé ». */
        fun served(status: String?): EmailVerificationWatchStatus = if (status == "proven") PROVEN else PENDING

        /** Jeton inconnu (401) ou expiré (410) : l'attente est finie. */
        private val ENDING_STATUSES: Set<Int> = setOf(401, 410)

        /** `ENDED` pour un refus qui finit l'attente, sinon `null` (panne passagère, à rejouer). */
        fun ending(httpStatus: Int?): EmailVerificationWatchStatus? =
            if (httpStatus != null && httpStatus in ENDING_STATUSES) ENDED else null
    }
}
