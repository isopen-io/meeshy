package me.meeshy.sdk.model.mention

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.isActiveMember

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
            when (conversationType) {
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
        /**
         * Un non-membre ne cite personne (#14066) : la passerelle lui refuse la recherche et ignore
         * ses mentions à l'envoi, donc [isMember] faux ferme la portée — ni local, ni réseau.
         */
        fun conversation(id: String?, conversationType: String?, isMember: Boolean): MentionContext? {
            val key = id?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val scope = if (isMember) MentionableScope.of(conversationType) else null
            return MentionContext(key, MentionContextType.CONVERSATION, scope)
        }

        /**
         * Le contexte de la conversation ouverte, l'appartenance du lecteur lue par [isActiveMember].
         * Un invité de lien ([isGuest]) est membre par sa session, et la passerelle lui refuse la
         * recherche (`allowAnonymous: false`) : son contexte n'interroge pas le réseau.
         */
        fun of(conversation: ApiConversation, currentUserId: String?, isGuest: Boolean = false): MentionContext? {
            val context = conversation(
                conversation.id,
                conversation.type,
                isMember = isGuest || conversation.isActiveMember(currentUserId),
            ) ?: return null
            return if (isGuest) context.copy(type = null) else context
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
