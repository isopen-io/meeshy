package me.meeshy.sdk.model.deeplink

import me.meeshy.sdk.model.ObjectIdGuard
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ResolvedTrackedLink

/**
 * **Le lien d'un contenu Meeshy (#19331)** — un post, un réel, une story ou une humeur — que la bulle déplie en carte
 * VIVANTE au lieu d'un aperçu Open Graph. Miroir Kotlin de `packages/shared/utils/content-link.ts` (source de vérité)
 * et de `ContentLinkTarget.swift` (MeeshySDK) : même table, mêmes vecteurs (`fixtures/content-link`).
 *
 * Deux formes : l'adresse DIRECTE (`/post|reel|story|mood/<id>`, et les anciennes `/feeds/post/<id>`, `/p/<id>`,
 * `/s/<id>`), dont l'identifiant se lit dans l'adresse ; et le lien SUIVI `/l/<jeton>`, que seule la passerelle sait
 * résoudre ([ofResolved]).
 *
 * Fail-closed : un autre hôte, un autre schéma que `https`, des identifiants ou un port dans l'adresse, un segment de
 * plus, ou un identifiant qui n'est pas un ObjectId ne lisent rien. Distinct de [DeepLinkParser], qui dit où un lien
 * MÈNE : cette loi-ci dit seulement si l'adresse DÉSIGNE un contenu dont on peut montrer la carte.
 */
sealed interface ContentLinkTarget {

    /** Un contenu désigné par son adresse ; [type] `null` : une forme ancienne, dont le genre se lit sur le contenu. */
    data class Content(val postId: String, val type: PostType?) : ContentLinkTarget

    /** Un lien suivi : sa cible se résout par `GET /tracking-links/:token/resolve`. */
    data class Tracked(val token: String) : ContentLinkTarget

    companion object {
        /** Les hôtes de l'application web, en production comme en staging (`MEESHY_WEB_HOSTS`). */
        val HOSTS: Set<String> = setOf("meeshy.me", "www.meeshy.me", "staging.meeshy.me")

        private val webPaths: Map<PostType, String> = mapOf(
            PostType.POST to "post",
            PostType.REEL to "reel",
            PostType.STORY to "story",
            PostType.STATUS to "mood",
        )

        private val pathKinds: Map<String, PostType?> =
            webPaths.entries.associate { (type, segment) -> segment to type } +
                mapOf("feeds/post" to null, "p" to null, "s" to PostType.STORY)

        private const val HTTPS_DEFAULT_PORT = 443
        private const val TOKEN_MIN = 2
        private const val TOKEN_MAX = 50
        private const val EXTERNAL_TARGET = "EXTERNAL"
        private const val TRACKING_KIND = "tracking"

        /** Ce que [link] désigne, ou `null` quand ce n'est pas le lien d'un contenu Meeshy (`contentLinkTarget`). */
        fun of(link: String): ContentLinkTarget? {
            val url = meeshyUrl(link) ?: return null
            ofPath(url.rawPath)?.let { return it }
            return trackedToken(url.rawPath)?.let(::Tracked)
        }

        /** Le contenu qu'un CHEMIN désigne, sans hôte (`contentPathTarget`). */
        fun ofPath(path: String): Content? {
            if (!path.startsWith("/")) return null
            val segments = path.removePrefix("/").removeSuffix("/").split('/')
            val (segment, postId) = when {
                segments.size == 2 -> segments[0] to segments[1]
                segments.size == 3 && segments[0] == "feeds" -> "feeds/${segments[1]}" to segments[2]
                else -> return null
            }
            if (!pathKinds.containsKey(segment) || !ObjectIdGuard.isValid(postId)) return null
            return Content(postId, pathKinds[segment])
        }

        /** L'adresse canonique d'un contenu sous une origine (`contentWebUrl`) : celle que frappe le partage suivi. */
        fun webUrl(origin: String, type: PostType, postId: String): String =
            "${origin.trimEnd('/')}/${webPaths.getValue(type)}/$postId"

        /** Le genre qu'une valeur du fil nomme EXACTEMENT (`isContentKind`) ; `null` pour toute autre. */
        fun kindOf(wire: String?): PostType? = PostType.entries.firstOrNull { it.name == wire }

        /**
         * Le contenu qu'un lien SUIVI désigne une fois résolu : une cible typée de contenu, ou — à défaut de cible typée
         * (`EXTERNAL`, lien frappé dans un message) — son adresse d'origine quand elle est elle-même l'adresse DIRECTE
         * d'un contenu. Une invitation, une fiche ou un site : `null`, la bulle garde son comportement d'avant.
         */
        fun ofResolved(resolved: ResolvedTrackedLink): Content? {
            if (resolved.kind != TRACKING_KIND) return null
            val type = kindOf(resolved.targetType)
            if (type != null) return resolved.targetId?.takeIf(ObjectIdGuard::isValid)?.let { Content(it, type) }
            val untyped = resolved.targetType.isNullOrEmpty() || resolved.targetType == EXTERNAL_TARGET
            if (!untyped) return null
            return resolved.originalUrl?.let(::of) as? Content
        }

        private fun meeshyUrl(link: String): DeepLinkUrl? {
            val url = DeepLinkUrl.parse(link.trim()) ?: return null
            val plain = url.scheme == "https" && url.userInfo.isNullOrEmpty() &&
                (url.port == null || url.port == HTTPS_DEFAULT_PORT)
            return url.takeIf { plain && it.host in HOSTS }
        }

        /** `/l/<jeton>` (jeton `[A-Za-z0-9_-]{2,50}`, barre finale tolérée, rien après). */
        private fun trackedToken(path: String): String? {
            val segments = path.removePrefix("/").removeSuffix("/").split('/')
            if (!path.startsWith("/") || segments.size != 2 || segments[0] != "l") return null
            return segments[1].takeIf { token -> token.length in TOKEN_MIN..TOKEN_MAX && token.all(::isTokenChar) }
        }

        private fun isTokenChar(c: Char): Boolean =
            c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c == '_' || c == '-'
    }
}
