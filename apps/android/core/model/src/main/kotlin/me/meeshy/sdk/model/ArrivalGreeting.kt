package me.meeshy.sdk.model

/**
 * **« Dis-lui salut »** (#16338) — l'invite d'un message système d'arrivée écrit, au toucher, les `@mentions` des
 * arrivants dans le composeur. Loi pure : qui se salue, ce qui s'écrit et où, et quelle part de la phrase est l'invite.
 */
object ArrivalGreeting {

    private const val INVITE_SEPARATOR = " — "

    /** La phrase d'arrivées, coupée en sa tête et son invite (celle qu'on rend en gras). */
    data class Split(val lead: String, val invite: String?)

    /** Les mentions qu'écrit l'invite : `@pseudo` par arrivant, dans l'ordre, sans doublon, suivies d'une espace. */
    fun mentions(usernames: List<String?>): String? {
        val handles = usernames
            .mapNotNull { raw -> raw?.trim()?.removePrefix("@")?.takeIf { it.isNotEmpty() } }
            .distinct()
        return handles.takeIf { it.isNotEmpty() }?.joinToString(separator = " ", postfix = " ") { "@$it" }
    }

    /** Le brouillon après l'invite : son texte d'abord, puis les mentions qu'il ne porte pas encore. */
    fun inserted(draft: String, mentions: String): String {
        val written = draft.split(Regex("\\s+")).filter { it.startsWith("@") }.toSet()
        val missing = mentions.trim().split(Regex("\\s+")).filter { it.isNotEmpty() && it !in written }
        if (missing.isEmpty()) return draft
        val head = draft.trimEnd()
        val tail = missing.joinToString(separator = " ", postfix = " ")
        return if (head.isEmpty()) tail else "$head $tail"
    }

    /** Les gabarits d'arrivées finissent tous par « — invite » : l'invite est ce qui suit le DERNIER tiret. */
    fun splitInvite(text: String): Split {
        val at = text.lastIndexOf(INVITE_SEPARATOR)
        if (at < 0) return Split(lead = text, invite = null)
        val invite = text.substring(at + INVITE_SEPARATOR.length).takeIf { it.isNotBlank() } ?: return Split(text, null)
        return Split(lead = text.substring(0, at + INVITE_SEPARATOR.length), invite = invite)
    }

    /** Le pseudo d'un arrivant annoncé seul : un compte, pas soi-même (un visiteur sans compte n'a qu'un `ano_…` technique). */
    fun handleOf(notice: JoinNoticeMetadata, isOwn: Boolean): String? =
        notice.username?.takeIf { !isOwn && !notice.isAnonymous && it.isNotBlank() }

    /** Les pseudos des arrivées groupées, résolus par la participation ; un arrivant que le fil ne connaît pas est écarté. */
    fun handlesOf(notice: ArrivalsNoticeMetadata, usernameByParticipant: Map<String, String>): List<String> =
        notice.arrivals.mapNotNull { usernameByParticipant[it.participantId]?.takeIf(String::isNotBlank) }
}
