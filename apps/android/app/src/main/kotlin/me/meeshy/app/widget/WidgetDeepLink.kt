package me.meeshy.app.widget

import java.net.URLEncoder

/**
 * Les liens `meeshy://` que posent les widgets. L'identifiant vient d'une ligne de cache, mais il
 * finit dans un chemin d'URL que l'app ouvre : un identifiant qui n'a pas la forme d'un
 * identifiant (séparateur, `?`, `#`, espace) n'est jamais interpolé, le tap retombe sur la liste.
 */
internal object WidgetDeepLink {
    const val HOME: String = "meeshy://conversations"

    /** La face petite du widget des conversations récentes : la plus récente (miroir iOS `widgetURL`). */
    const val RECENT: String = "meeshy://conversations/recent"

    /** La liste ouverte sur le filtre « Non lus » : tap des widgets compteur (miroir iOS `widgetURL`). */
    const val UNREAD: String = "meeshy://conversations/unread"

    private val SAFE_ID = Regex("[A-Za-z0-9_-]{1,64}")

    fun isSafeId(id: String): Boolean = SAFE_ID.matches(id)

    fun conversation(conversationId: String): String =
        if (SAFE_ID.matches(conversationId)) "meeshy://conversation/$conversationId" else HOME

    fun reply(conversationId: String, draftText: String): String =
        if (SAFE_ID.matches(conversationId)) {
            "meeshy://conversation/$conversationId?draft=${URLEncoder.encode(draftText, "UTF-8")}"
        } else {
            HOME
        }
}
