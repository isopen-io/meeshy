package me.meeshy.sdk.model

/**
 * Ce qu'une bannière in-app AFFICHE — la notification qui descend du haut de l'écran puis
 * s'efface.
 *
 * Cinq pièces et pas trois, parce qu'une bannière doit dire **CE QUI vient d'arriver**, pas
 * seulement qui l'a fait et ce qu'il a écrit. Un commentaire sur un réel, une réaction à une
 * story et la publication d'une humeur se ressemblaient toutes trois — « Alice » / « super ! »
 * — et rien ne les distinguait (porteur produit, 2026-08-30).
 *
 * Les sept cadrages, tels que le produit les demande :
 *
 * | cas | headline | body |
 * |---|---|---|
 * | commentaire de contenu | X a commenté une story / un réel / un post | vignette + commentaire |
 * | nouvelle publication | X a publié un réel / une humeur / un post / une story | vignette + contenu |
 * | message privé | X | message |
 * | message de groupe | X dans « nom LOCAL du groupe » | message / média / protection |
 * | relation acceptée | X a accepté votre demande | — |
 * | demande de relation | X veut se connecter | — |
 * | réaction à un contenu | X a réagi à votre story / humeur / post / réel / commentaire | vignette + réaction |
 *
 * Miroir de `NotificationBannerPresentation` (iOS, MeeshySDK) et de
 * `apps/web/utils/notification-banner.ts`. **La phrase d'action vient du SERVEUR** (`title` +
 * `subtitle`) : la réécrire ici en français en dur contournerait le Prisme, qui localise côté
 * passerelle. La seule part que le client compose est « X dans <groupe> » — le nom LOCAL d'une
 * conversation (renommage + emoji favori) n'existe que sur l'appareil.
 */
public data class NotificationBannerPresentation(
    /** Ligne 1 : QUI, et QUOI. Jamais vide. */
    val headline: BannerHeadline,
    /**
     * Ligne 2 : la charge — le commentaire, le message, l'aperçu du contenu visé. `null` quand
     * la headline se suffit (demande de relation, contenu sans texte dont le serveur retombe
     * sur la phrase d'action).
     */
    val body: String?,
    /**
     * Le média du contenu visé, quand il n'a pas de texte à montrer — c'est la couche UI qui
     * le TRADUIT (« 📷 Photo »), jamais ce module : `core/model` n'a pas de ressources, et une
     * chaîne française en dur ici serait invisible aux six autres langues.
     */
    val mediaSummary: MediaSummary?,
    /**
     * La réaction, rendue COMME une réaction et non noyée dans une phrase. `null` quand la
     * headline la porte déjà — le serveur l'y fusionne (« a réagi 🔥 à votre story ») et la
     * répéter dirait deux fois la même chose sur la même carte.
     */
    val reactionBadge: String?,
    /** Vignette du contenu visé. `null` ⇒ la bannière pose [contentIcon]. */
    val thumbnailUrl: String?,
    /** Icône typée du contenu visé — ce qui tient la place de la vignette quand il n'y en a pas. */
    val contentIcon: BannerContentIcon,
)

/**
 * La headline est un type SOMME, pas une chaîne composée.
 *
 * Le port littéral d'iOS formaterait ici « %1$s dans %2$s » — mais ce module n'a pas accès aux
 * ressources Android, et une chaîne composée dans le modèle serait intraduisible. La couche UI
 * reçoit les deux morceaux et applique `R.string.notification_banner_in_conversation`.
 */
public sealed interface BannerHeadline {
    /** Le serveur a déjà tout dit : `title` + `subtitle`, ou l'acteur seul. */
    public data class Plain(val text: String) : BannerHeadline

    /** « X dans <groupe> » — la seule composition qui appartient au client. */
    public data class InConversation(val actor: String, val groupName: String) : BannerHeadline
}

/** Nature du média principal — traduite par la couche UI. */
public enum class MediaSummary { IMAGE, VIDEO, AUDIO }

/** L'entité visée, quand on la connaît ; le média sinon ; à défaut, rien de typé. */
public enum class BannerContentIcon { IMAGE, VIDEO, AUDIO, STORY, REEL, MOOD, POST, GENERIC }

/**
 * Les familles de cadrage. **Le TYPE décide, jamais la forme des champs** : `subtitle` porte le
 * nom du GROUPE pour un message et la PHRASE D'ACTION pour tout le reste — deux sens pour un
 * champ, et seul le type les sépare.
 */
public enum class BannerFraming {
    /** Message de conversation : « X », ou « X dans <groupe> ». */
    CONVERSATION,

    /**
     * Demande / acceptation de relation : la headline dit tout. Le corps du serveur n'est qu'un
     * intitulé de rubrique (« Nouvelle demande de contact ») qui n'ajoute rien.
     */
    RELATION,

    /** Tout le reste : la headline est `<acteur> <phrase d'action serveur>`. */
    ACTION,
}

public object NotificationBannerFraming {

    private val CONVERSATION_TYPES = setOf(
        "new_message", "message_reply", "reply", "user_mentioned", "mention",
        "message_reaction", "reaction", "story_reply",
    )

    private val RELATION_TYPES = setOf(
        "friend_request", "contact_request", "friend_accepted", "contact_accepted",
    )

    private val REACTION_TYPES = setOf(
        "message_reaction", "reaction", "post_like", "story_reaction", "status_reaction",
        "comment_like", "comment_reaction",
    )

    /**
     * Le type est comparé en MINUSCULES : la passerelle sert les deux casses (`new_message` et
     * `NEW_MESSAGE` en rétrocompatibilité), et un ensemble par casse divergerait au premier
     * type ajouté d'un seul côté.
     */
    public fun framing(type: String): BannerFraming = when (type.lowercase()) {
        in CONVERSATION_TYPES -> BannerFraming.CONVERSATION
        in RELATION_TYPES -> BannerFraming.RELATION
        else -> BannerFraming.ACTION
    }

    /**
     * Construit la bannière.
     *
     * @param groupName le nom LOCAL de la conversation (renommée + emoji favori), résolu par
     *   l'app. `null` ⇒ repli sur le titre serveur. C'est la SEULE part de la présentation qui
     *   ne peut pas venir du serveur : lui ne connaît que le nom canonique.
     * @param isDirect une conversation à deux n'affiche jamais son nom — « Alice dans Alice ».
     */
    public fun present(
        notification: ApiNotification,
        groupName: String? = null,
        isDirect: Boolean = false,
    ): NotificationBannerPresentation {
        val framing = framing(notification.type)
        return NotificationBannerPresentation(
            headline = headline(notification, framing, groupName, isDirect),
            body = body(notification, framing),
            mediaSummary = mediaSummary(notification),
            reactionBadge = reactionBadge(notification),
            thumbnailUrl = thumbnailUrl(notification),
            contentIcon = contentIcon(notification),
        )
    }

    private fun headline(
        notification: ApiNotification,
        framing: BannerFraming,
        groupName: String?,
        isDirect: Boolean,
    ): BannerHeadline {
        val actor = actorDisplayName(notification)
        return when (framing) {
            BannerFraming.CONVERSATION -> {
                val group = groupName.nonBlank()
                    ?: notification.context?.conversationTitle.nonBlank()
                    ?: notification.subtitle.nonBlank()
                if (isDirect || group == null) BannerHeadline.Plain(actor)
                else BannerHeadline.InConversation(actor, group)
            }
            BannerFraming.RELATION, BannerFraming.ACTION -> {
                val head = notification.title.nonBlank() ?: actor
                val action = notification.subtitle.nonBlank()
                    ?: return BannerHeadline.Plain(head)
                BannerHeadline.Plain("$head $action")
            }
        }
    }

    private fun body(notification: ApiNotification, framing: BannerFraming): String? = when (framing) {
        // « Nouvelle demande de contact » sous « Alice veut se connecter » dit deux fois la
        // même chose, la seconde moins bien.
        BannerFraming.RELATION -> null

        BannerFraming.CONVERSATION ->
            notification.metadata?.messagePreview.nonBlank() ?: notification.content.nonBlank()

        // Le serveur garantit que la LIGNE DE LISTE n'est jamais vide : à défaut d'extrait,
        // `content` retombe sur la phrase d'action elle-même (« a publié une nouvelle story »).
        // Sur une bannière qui porte déjà cette phrase en headline, la répéter est exactement
        // ce que `dedupePushSubtitle` corrige côté push — même règle ici.
        BannerFraming.ACTION -> {
            val raw = notification.content.nonBlank()
                ?: notification.metadata?.commentPreview.nonBlank()
            when {
                raw == null -> null
                raw == notification.subtitle.nonBlank() -> null
                else -> raw
            }
        }
    }

    private fun mediaSummary(notification: ApiNotification): MediaSummary? =
        when (notification.metadata?.mediaType?.lowercase()) {
            "image" -> MediaSummary.IMAGE
            "video" -> MediaSummary.VIDEO
            "audio" -> MediaSummary.AUDIO
            else -> null
        }

    private fun reactionBadge(notification: ApiNotification): String? {
        if (notification.type.lowercase() !in REACTION_TYPES) return null
        // Les éventails sur CONTENU écrivent l'émoji sous `emoji`, ceux sur MESSAGE sous
        // `reactionEmoji` : deux noms de fil pour une seule donnée.
        val emoji = notification.metadata?.emoji.nonBlank()
            ?: notification.metadata?.reactionEmoji.nonBlank()
            ?: return null
        // Le serveur fusionne déjà l'émoji dans la phrase d'action (« a réagi 🔥 à votre
        // story ») : le rendre une seconde fois en pastille le dirait deux fois.
        if (notification.subtitle.nonBlank()?.contains(emoji) == true) return null
        return emoji
    }

    private fun thumbnailUrl(notification: ApiNotification): String? {
        notification.metadata?.postThumbnailUrl.nonBlank()?.let { return it }
        val mime = notification.context?.firstAttachmentMimeType ?: return null
        if (!mime.startsWith("image/")) return null
        return notification.context.firstAttachmentUrl.nonBlank()
    }

    private fun contentIcon(notification: ApiNotification): BannerContentIcon {
        when (notification.metadata?.mediaType?.lowercase()) {
            "image" -> return BannerContentIcon.IMAGE
            "video" -> return BannerContentIcon.VIDEO
            "audio" -> return BannerContentIcon.AUDIO
        }
        val entity = notification.metadata?.postType.nonBlank()
            ?: notification.metadata?.contentType.nonBlank()
        return when (entity?.uppercase()) {
            "STORY" -> BannerContentIcon.STORY
            "REEL" -> BannerContentIcon.REEL
            "MOOD", "STATUS" -> BannerContentIcon.MOOD
            "POST" -> BannerContentIcon.POST
            else -> BannerContentIcon.GENERIC
        }
    }

    private fun actorDisplayName(notification: ApiNotification): String =
        notification.actor?.displayName.nonBlank()
            ?: notification.actor?.username.nonBlank()
            ?: notification.title.nonBlank()
            ?: ""

    private fun String?.nonBlank(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
}
