package me.meeshy.sdk.model.visitor

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.model.TrackedLinkSharer

/** Ce qu'un lien universel ouvre SANS session : une publication, un reel ou une story PUBLICS (iOS `VisitorContentKind`). */
enum class VisitorContentKind { POST, REEL, STORY }

/**
 * Le contenu a montrer a un visiteur, et le jeton `via` du lien suivi qui l'a amene (seul moyen de nommer qui le lui a
 * partage). Miroir de iOS `VisitorContentRequest`.
 */
data class VisitorContentRequest(val postId: String, val kind: VisitorContentKind, val via: String?) {
    val id: String get() = "$postId|${via.orEmpty()}"

    companion object {
        private val MEESHY_URL = Regex(
            "^https://(?:www\\.)?meeshy\\.me(?::443)?(/[^?#]*)?(?:\\?([^#]*))?(?:#.*)?$",
            RegexOption.IGNORE_CASE,
        )
        private val TOKEN = Regex("^[A-Za-z0-9_-]{1,64}$")
        private val POST_SEGMENTS = setOf("post", "p")
        private val STORY_SEGMENTS = setOf("story", "stories", "s")

        /**
         * `null` pour tout ce qui n'est pas exactement un lien public de publication, de reel ou de story sur l'origine
         * https de Meeshy : un segment en plus, un identifiant encode ou espace, un autre hote, une autre porte.
         */
        fun fromUri(uri: String?): VisitorContentRequest? {
            val match = uri?.let(MEESHY_URL::find) ?: return null
            val path = match.groupValues[1]
            val query = match.groupValues[2]
            val segments = path.split('/').drop(1).let { if (it.lastOrNull() == "") it.dropLast(1) else it }
            val target = target(segments, query) ?: return null
            return VisitorContentRequest(target.second, target.first, via = parameter("via", query)?.takeIf(TOKEN::matches))
        }

        private fun target(segments: List<String>, query: String): Pair<VisitorContentKind, String>? {
            val head = segments.firstOrNull() ?: return null
            return when {
                head == "feeds" -> segments.takeIf { it.size == 3 && it[1] in POST_SEGMENTS }?.let { VisitorContentKind.POST to it[2] }
                head in POST_SEGMENTS -> single(segments)?.let { VisitorContentKind.POST to it }
                head == "reel" -> single(segments)?.let { VisitorContentKind.REEL to it }
                head == "reels" -> segments.takeIf { it.size == 1 }?.let { parameter("seed", query) }?.let { VisitorContentKind.REEL to it }
                head in STORY_SEGMENTS -> single(segments)?.let { VisitorContentKind.STORY to it }
                else -> null
            }?.takeIf { TOKEN.matches(it.second) }
        }

        private fun single(segments: List<String>): String? = segments.takeIf { it.size == 2 }?.get(1)

        private fun parameter(name: String, query: String): String? =
            query.split('&').firstOrNull { it.startsWith("$name=") }?.substringAfter('=')
    }
}

/** Ce que l'ecran visiteur peut dire de son contenu (iOS `VisitorContentState`). */
sealed interface VisitorContentState {
    data object Pending : VisitorContentState

    /** La, avec qui l'a partage quand le lien le nomme. */
    data class Served(val post: ApiPost, val sharer: TrackedLinkSharer?) : VisitorContentState

    /** La passerelle a dit non (404/403 confondus) : rien a reessayer. */
    data object Refused : VisitorContentState

    /** Panne ou coupure : « Reessayer » a un sens. */
    data class Failed(val failure: ContentFetchFailure) : VisitorContentState

    /** La carte d'invitation : cachee pendant la lecture, fermable seulement sur un contenu servi. */
    fun showsCard(dismissed: Boolean): Boolean = when (this) {
        Pending -> false
        is Served -> !dismissed
        Refused, is Failed -> true
    }
}

/** Les gestes de la carte d'invitation, dans leur ordre d'affichage. */
enum class VisitorInvitationAction {
    RETRY, SIGN_UP, SIGN_IN, KEEP_WATCHING;

    companion object {
        fun actions(state: VisitorContentState): List<VisitorInvitationAction> = when (state) {
            VisitorContentState.Pending -> emptyList()
            is VisitorContentState.Served -> listOf(SIGN_UP, SIGN_IN, KEEP_WATCHING)
            VisitorContentState.Refused -> listOf(SIGN_UP, SIGN_IN)
            is VisitorContentState.Failed -> listOf(RETRY, SIGN_UP, SIGN_IN)
        }
    }
}

/** Ce que l'ecran montre SOUS la carte : un refus ne laisse jamais une page claire et vide. */
enum class VisitorContentSurface {
    LOADING, READER, NEUTRAL_BACKDROP;

    companion object {
        fun of(state: VisitorContentState): VisitorContentSurface = when (state) {
            VisitorContentState.Pending -> LOADING
            is VisitorContentState.Served -> READER
            VisitorContentState.Refused, is VisitorContentState.Failed -> NEUTRAL_BACKDROP
        }
    }
}

object VisitorSharerName {
    /** Le nom affiche, sinon le pseudo precede de « @ ». */
    fun of(sharer: TrackedLinkSharer): String =
        sharer.displayName?.trim()?.takeIf { it.isNotEmpty() } ?: "@${sharer.username}"
}
