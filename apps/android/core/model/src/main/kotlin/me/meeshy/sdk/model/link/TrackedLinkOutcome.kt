package me.meeshy.sdk.model.link

import me.meeshy.sdk.model.ResolvedTrackedLink
import me.meeshy.sdk.model.deeplink.DeepLinkDestination
import me.meeshy.sdk.model.deeplink.DeepLinkParser

/** Ce qu'un `/l/<jeton>` résolu donne à faire (iOS `DeepLinkRouter.trackedDestination`). */
sealed interface TrackedLinkOutcome {
    /** Une destination de l'app. */
    data class Open(val destination: DeepLinkDestination) : TrackedLinkOutcome

    /** Une invitation : un code à retenir, pas une destination. */
    data class Referral(val code: String) : TrackedLinkOutcome

    /** Une cible web : elle s'ouvre dans le navigateur, on ne la rejoint pas. */
    data class External(val url: String) : TrackedLinkOutcome

    /** Le serveur ne sait pas résoudre ce jeton, ou on ne l'a pas joint : repli « lien non résolu ». */
    data class Unresolved(val token: String) : TrackedLinkOutcome
}

object TrackedLinkOutcomes {
    private val contentTypes = setOf("STORY", "PROFILE", "REEL", "POST", "STATUS")

    /**
     * Ordre de lecture : l'invitation de conversation d'abord (le jeton EST alors le `linkId`, seul cas où la voie
     * de jointure est la bonne), puis la cible typée, puis l'adresse d'origine reparsée, puis l'aveu d'échec.
     * `isActive == false` n'écarte PAS la cible typée : une story expirée désactive ses liens et son écran porte
     * déjà l'état « indisponible ».
     */
    fun outcome(resolved: ResolvedTrackedLink?, token: String, environmentWebOrigin: String): TrackedLinkOutcome {
        if (resolved == null) return TrackedLinkOutcome.Unresolved(token)
        referralCode(resolved, environmentWebOrigin)?.let { return TrackedLinkOutcome.Referral(it) }
        val kind = resolved.kind.orEmpty().lowercase()
        val type = resolved.targetType.orEmpty().uppercase()
        if (kind == "conversation" || type == "CONVERSATION") {
            return TrackedLinkOutcome.Open(DeepLinkDestination.JoinLink(token))
        }
        typedTarget(type, resolved.targetId)?.let { return TrackedLinkOutcome.Open(it) }
        val original = resolved.originalUrl?.takeIf { it.isNotBlank() } ?: return TrackedLinkOutcome.Unresolved(token)
        return fromOriginalUrl(original, environmentWebOrigin) ?: TrackedLinkOutcome.Unresolved(token)
    }

    private fun typedTarget(type: String, targetId: String?): DeepLinkDestination? {
        val id = targetId?.takeIf { it.isNotEmpty() } ?: return null
        return when (type) {
            "STORY" -> DeepLinkDestination.StoryDetail(id)
            "PROFILE" -> DeepLinkDestination.UserProfile(id)
            "REEL" -> DeepLinkDestination.Reel(id)
            "POST", "STATUS" -> DeepLinkDestination.PostDetail(id)
            else -> null
        }
    }

    /** Une cible typée prime : elle n'est jamais une invitation, quelle que soit son adresse. */
    private fun referralCode(resolved: ResolvedTrackedLink, origin: String): String? {
        val kind = resolved.kind.orEmpty().lowercase()
        val type = resolved.targetType.orEmpty().uppercase()
        if (kind == "conversation" || type == "CONVERSATION") return null
        if (!resolved.targetId.isNullOrEmpty() && type in contentTypes) return null
        val url = resolved.originalUrl ?: return null
        return (DeepLinkParser.parse(url, origin) as? DeepLinkDestination.Referral)?.code
    }

    /** Jamais un lien qui CONNECTE ou réinitialise : la cible est choisie par son créateur, qui y mettrait son jeton. */
    private fun fromOriginalUrl(url: String, origin: String): TrackedLinkOutcome? =
        when (val destination = DeepLinkParser.parse(url, origin)) {
            is DeepLinkDestination.MagicLink,
            is DeepLinkDestination.EmailVerificationLink,
            is DeepLinkDestination.PasswordResetLink,
            is DeepLinkDestination.TrackedLink,
            is DeepLinkDestination.Share,
            is DeepLinkDestination.Referral,
            is DeepLinkDestination.Call,
            -> null
            is DeepLinkDestination.External ->
                destination.url.takeIf { it.startsWith("https://", true) || it.startsWith("http://", true) }
                    ?.let { TrackedLinkOutcome.External(it) }
            else -> TrackedLinkOutcome.Open(destination)
        }
}
