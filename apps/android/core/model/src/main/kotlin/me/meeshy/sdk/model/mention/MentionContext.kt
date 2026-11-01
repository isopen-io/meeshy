package me.meeshy.sdk.model.mention

/** Le `contextType` de `GET /mentions/suggestions` : un post couvre aussi story, réel et humeur. */
enum class MentionContextType(val wire: String) {
    CONVERSATION("conversation"),
    POST("post"),
}

/**
 * Qui peut-on mentionner (#14071) — miroir de `mentionableScope`
 * (`packages/shared/utils/mention-lookup.ts`), la table que la passerelle applique à l'envoi :
 * `direct` → l'interlocuteur seul, `group` → les membres, `public`/`global`/`broadcast` → tout
 * compte. Un type inconnu n'a aucune portée.
 */
enum class MentionableScope {
    INTERLOCUTOR,
    MEMBERS,
    DIRECTORY,
    ;

    companion object {
        fun of(conversationType: String?): MentionableScope? =
            when (conversationType?.trim()?.lowercase()) {
                "direct" -> INTERLOCUTOR
                "group" -> MEMBERS
                "public", "global", "broadcast" -> DIRECTORY
                else -> null
            }
    }
}

/**
 * Le contexte d'une saisie « @ » (#14053, #14071) : ce que la passerelle lit pour faire remonter
 * les personnes du contexte ([type], `null` = aucune question au réseau), et la [scope] qui dit
 * au cache local qui il peut proposer — une suggestion qui n'aurait aucun effet à l'envoi n'est
 * pas affichée. `null` : personne (type inconnu, échec fermé).
 */
data class MentionContext(
    val id: String,
    val type: MentionContextType?,
    val scope: MentionableScope? = MentionableScope.DIRECTORY,
) {
    /** Une portée fermée ne propose que les personnes du contexte (membres, interlocuteur). */
    val membersOnly: Boolean get() = scope != MentionableScope.DIRECTORY

    /** Le réseau n'est interrogé que si le contexte a une question à lui poser ET une portée. */
    val searchesRemotely: Boolean get() = type != null && scope != null

    companion object {
        fun conversation(id: String?, conversationType: String?): MentionContext? {
            val key = id?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return MentionContext(key, MentionContextType.CONVERSATION, MentionableScope.of(conversationType))
        }

        fun post(id: String?): MentionContext? {
            val key = id?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return MentionContext(key, MentionContextType.POST)
        }

        /**
         * Une réponse qui part dans le DM de [authorId] (réponse à une story, à une humeur) : seule
         * la mention de l'interlocuteur y a un effet, donc le roster ne porte que lui et le réseau
         * n'est pas interrogé — le contexte du post ramènerait des intervenants sans effet.
         */
        fun interlocutor(authorId: String?): MentionContext? {
            val key = authorId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return MentionContext(key, type = null, scope = MentionableScope.INTERLOCUTOR)
        }
    }
}
