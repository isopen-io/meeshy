package me.meeshy.sdk.net

import me.meeshy.sdk.net.routes.ApiRoutesConversations
import me.meeshy.sdk.net.routes.ApiRoutesInvitations
import me.meeshy.sdk.net.routes.ApiRoutesLinks
import me.meeshy.sdk.net.routes.ApiRoutesPosts
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pourquoi une action attend une adresse prouvée (#8365) — la feuille de validation le DIT
 * (« Pour publier, validez votre adresse »). [MORE_LINKS] : la passerelle a refusé un lien au-delà des
 * cinq actifs qu'elle permet à une adresse non prouvée (#9713, #9715). Miroir de `EmailGateReason` (iOS).
 */
enum class EmailGateReason { PUBLISH, INVITE, LINK, MORE_LINKS }

/**
 * Celui qui sait si l'adresse du compte courant est prouvée, et qui sait la faire prouver. Le réseau n'en
 * connaît que ce contrat : la feuille, le moment où elle se présente et ce qu'elle dit restent l'affaire de l'app.
 */
interface EmailVerificationGating {
    /** L'adresse est CONNUE non prouvée — la validation s'ouvre avant l'envoi. */
    suspend fun emailKnownUnproven(): Boolean

    /** Présente la validation ; `true` quand le code est validé, `false` quand le lecteur la ferme (ou que rien ne peut la présenter). */
    suspend fun verifyEmail(reason: EmailGateReason): Boolean
}

/**
 * Le gardien de l'app, posé par l'hôte de la feuille de validation. Vide : aucune feuille ne peut se
 * présenter, le refus passe tel quel. Miroir de `EmailVerificationGate.current` (iOS).
 */
@Singleton
class EmailVerificationGateRegistry @Inject constructor() {
    @Volatile
    var current: EmailVerificationGating? = null
}

/**
 * **UN REFUS `EMAIL_NOT_VERIFIED` MÈNE À LA VALIDATION, PUIS L'ACTION REPART** (#8365). La passerelle garde
 * `/invitations/email` derrière une adresse prouvée, `POST /posts` et `/posts/from-attachment` derrière le
 * délai de grâce de l'adresse (#8476), `/links` et `/conversations/:id/new-link` derrière ce même délai, au plus
 * cinq liens actifs (#9713) — `services/gateway/src/middleware/verification-gates.ts`.
 *
 * Les règles pures sont ici ; [EmailVerificationGateInterceptor] les applique au SEUL site par lequel ces cinq
 * routes passent. Prévenir plutôt que guérir pour INVITER seulement ; PUBLIER et CRÉER UN LIEN ne sont jamais
 * retenus d'avance (la passerelle les permet tant que le délai de grâce court) : seul son refus ouvre la
 * validation. Miroir de `EmailVerificationGate` (iOS `EmailVerificationGate.swift`).
 */
object EmailVerificationGateRules {
    const val REFUSAL_CODE: String = "EMAIL_NOT_VERIFIED"

    /** Le texte du refus au plafond de liens actifs (`sendShareLinkGraceRefusal`). */
    const val SHARE_LINK_CAP_REFUSAL: String = "Email verification required to create more share links"

    private val newLinkShape: Pair<String, String> =
        ApiRoutesConversations.BY_ID_NEW_LINK.split("{id}").let { it.first() to it.last() }

    private val guardedRoutes: Map<String, EmailGateReason> = mapOf(
        ApiRoutesPosts.ROOT to EmailGateReason.PUBLISH,
        ApiRoutesPosts.FROM_ATTACHMENT to EmailGateReason.PUBLISH,
        ApiRoutesInvitations.EMAIL to EmailGateReason.INVITE,
        ApiRoutesLinks.ROOT to EmailGateReason.LINK,
    )

    /**
     * La raison d'une requête gardée, `null` pour toute autre. Le chemin peut être complet (sous [apiPathPrefix],
     * le chemin de l'URL de base de l'API) ou déjà relatif à ce préfixe.
     */
    fun reason(method: String, path: String, apiPathPrefix: String): EmailGateReason? {
        if (!method.equals("POST", ignoreCase = true)) return null
        val route = routePath(path, apiPathPrefix)
        guardedRoutes[route]?.let { return it }
        val (prefix, suffix) = newLinkShape
        if (!route.startsWith(prefix) || !route.endsWith(suffix) || route.length <= prefix.length + suffix.length) return null
        val id = route.substring(prefix.length, route.length - suffix.length)
        return if (id.contains('/')) null else EmailGateReason.LINK
    }

    /** Seul INVITER est retenu d'avance quand l'adresse est connue non prouvée. */
    fun isHeldBack(reason: EmailGateReason): Boolean = reason == EmailGateReason.INVITE

    /** La raison que la feuille dit après un refus : un lien refusé au plafond devient [EmailGateReason.MORE_LINKS]. */
    fun reasonAfterRefusal(reason: EmailGateReason, refusalText: String?): EmailGateReason =
        if (reason == EmailGateReason.LINK && refusalText == SHARE_LINK_CAP_REFUSAL) EmailGateReason.MORE_LINKS else reason

    fun isRefusalCode(code: String?): Boolean = code == REFUSAL_CODE

    private fun routePath(path: String, apiPathPrefix: String): String {
        val withoutQuery = path.substringBefore('?').trimStart('/')
        return withoutQuery.removePrefix(apiPathPrefix.trim('/').let { if (it.isEmpty()) it else "$it/" })
    }
}
