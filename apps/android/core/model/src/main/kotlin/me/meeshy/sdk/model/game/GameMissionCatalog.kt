package me.meeshy.sdk.model.game

/*
 * Le catalogue des défis du jour (#9635), rangé par les quatre buts du porteur. MIROIR de
 * `packages/shared/utils/game/mission-catalog.ts`. Un gabarit n'attend qu'un signal que la
 * PASSERELLE établit : jamais la seule déclaration d'un client. Les clés et signaux restent
 * des chaînes OUVERTES (un gabarit ajouté au serveur ne casse rien).
 */

public enum class MissionGoal { Animate, Courage, Languages, Reach }

/** Ce qu'un défi peut exiger du profil. */
public enum class MissionCapability { Contacts, ActiveConversations, Communities, Multilingual }

/** Le compteur d'engagement dont la moyenne quotidienne règle l'objectif ; [ratio] quand ce n'est qu'un indice. */
public data class MissionHabit(val operation: String, val ratio: Double = 1.0)

public data class MissionTemplate(
    val key: String,
    val difficulty: MissionDifficulty,
    val goal: MissionGoal,
    /** `axis:<clé d'opération>` ou un fait posé au geste. */
    val signal: String,
    val baseTarget: Int,
    val minTarget: Int,
    val maxTarget: Int,
    /** Points par unité d'objectif, en plus de la base de la difficulté. */
    val unitPoints: Int,
    val habit: MissionHabit? = null,
    /** Défi de langue : le jour du Prisme en garantit un. */
    val prism: Boolean = false,
    val weight: Int? = null,
    val requires: List<MissionCapability> = emptyList(),
)

public object GameMissionCatalog {

    private val TEXT_HABIT = MissionHabit("content.text_message", 0.2)

    public val templates: List<MissionTemplate> = listOf(
        MissionTemplate("send-texts", MissionDifficulty.Easy, MissionGoal.Animate, "axis:content.text_message", 5, 1, 15, 15, habit = MissionHabit("content.text_message")),
        MissionTemplate("send-attachments", MissionDifficulty.Easy, MissionGoal.Animate, "axis:tool.attachment", 2, 1, 6, 16, habit = MissionHabit("tool.attachment")),
        MissionTemplate("react-messages", MissionDifficulty.Easy, MissionGoal.Animate, "axis:tool.reaction", 5, 1, 15, 8, habit = MissionHabit("tool.reaction"), requires = listOf(MissionCapability.Contacts)),
        MissionTemplate("react-posts", MissionDifficulty.Easy, MissionGoal.Animate, "axis:tool.post_reaction", 5, 1, 15, 6, habit = MissionHabit("tool.post_reaction")),
        MissionTemplate("use-stickers", MissionDifficulty.Easy, MissionGoal.Animate, "axis:tool.sticker", 2, 1, 6, 6, habit = MissionHabit("tool.sticker")),
        MissionTemplate("comment-text", MissionDifficulty.Medium, MissionGoal.Animate, "comment-others-post", 3, 1, 6, 190, habit = MissionHabit("comment.text")),
        MissionTemplate("publish-story", MissionDifficulty.Medium, MissionGoal.Animate, "axis:content.story", 1, 1, 2, 560, habit = MissionHabit("content.story")),
        MissionTemplate("publish-post", MissionDifficulty.Medium, MissionGoal.Animate, "axis:content.post", 1, 1, 1, 920),
        MissionTemplate("reply-story", MissionDifficulty.Medium, MissionGoal.Animate, "story-reply", 1, 1, 3, 15, requires = listOf(MissionCapability.Contacts)),
        MissionTemplate("reply-conversations", MissionDifficulty.Medium, MissionGoal.Animate, "reply-distinct-conversations", 3, 1, 4, 15, habit = TEXT_HABIT, requires = listOf(MissionCapability.Contacts)),
        MissionTemplate("join-community", MissionDifficulty.Medium, MissionGoal.Animate, "axis:social.community_joined", 1, 1, 1, 15),
        MissionTemplate("long-chat", MissionDifficulty.Hard, MissionGoal.Animate, "axis:content.text_message", 10, 3, 40, 12, habit = MissionHabit("content.text_message")),
        MissionTemplate("publish-posts", MissionDifficulty.Hard, MissionGoal.Animate, "axis:content.post", 2, 2, 3, 950, habit = MissionHabit("content.post")),
        MissionTemplate("publish-reel", MissionDifficulty.Hard, MissionGoal.Animate, "reel-published", 1, 1, 1, 1840),
        MissionTemplate("voice-comments", MissionDifficulty.Hard, MissionGoal.Animate, "axis:comment.audio", 2, 1, 3, 150, habit = MissionHabit("comment.audio")),
        MissionTemplate("reply-conversations-wide", MissionDifficulty.Hard, MissionGoal.Animate, "reply-distinct-conversations", 6, 2, 8, 15, habit = TEXT_HABIT, requires = listOf(MissionCapability.ActiveConversations)),
        MissionTemplate("gold-reply-conversations", MissionDifficulty.Gold, MissionGoal.Animate, "reply-distinct-conversations", 8, 3, 12, 15, habit = TEXT_HABIT, requires = listOf(MissionCapability.ActiveConversations)),
        MissionTemplate("gold-replies-received", MissionDifficulty.Gold, MissionGoal.Animate, "replies-received-distinct-authors", 4, 2, 6, 25, requires = listOf(MissionCapability.ActiveConversations)),
        MissionTemplate("send-voice", MissionDifficulty.Easy, MissionGoal.Courage, "axis:content.audio_message", 1, 1, 5, 20, habit = MissionHabit("content.audio_message")),
        MissionTemplate("write-someone-new", MissionDifficulty.Medium, MissionGoal.Courage, "axis:conversation.private", 1, 1, 3, 20),
        MissionTemplate("start-conversation", MissionDifficulty.Medium, MissionGoal.Courage, "conversation-started", 1, 1, 2, 25),
        MissionTemplate("community-hello", MissionDifficulty.Medium, MissionGoal.Courage, "axis:conversation.community", 1, 1, 2, 20, requires = listOf(MissionCapability.Communities)),
        MissionTemplate("comment-stranger-post", MissionDifficulty.Medium, MissionGoal.Courage, "comment-stranger-public-post", 1, 1, 3, 175),
        MissionTemplate("prism-foreign-messages", MissionDifficulty.Medium, MissionGoal.Languages, "foreign-language-message", 2, 1, 6, 15, prism = true, requires = listOf(MissionCapability.Multilingual)),
        MissionTemplate("cross-language-chat", MissionDifficulty.Medium, MissionGoal.Languages, "cross-language-exchange", 1, 1, 3, 20, prism = true, requires = listOf(MissionCapability.Contacts)),
        MissionTemplate("prism-foreign-exchange", MissionDifficulty.Hard, MissionGoal.Languages, "foreign-language-message", 5, 2, 15, 15, prism = true, requires = listOf(MissionCapability.Multilingual)),
        MissionTemplate("reply-their-language", MissionDifficulty.Hard, MissionGoal.Languages, "reply-in-their-language", 1, 1, 5, 25, prism = true, requires = listOf(MissionCapability.Multilingual, MissionCapability.Contacts)),
        MissionTemplate("create-invite-link", MissionDifficulty.Easy, MissionGoal.Reach, "axis:social.affiliate_link_created", 1, 1, 1, 10),
        MissionTemplate("share-link", MissionDifficulty.Medium, MissionGoal.Reach, "axis:social.share", 1, 1, 3, 30, habit = MissionHabit("social.share")),
        MissionTemplate("invite-contact", MissionDifficulty.Medium, MissionGoal.Reach, "axis:social.email_invite", 1, 1, 3, 20),
        MissionTemplate("invite-joined", MissionDifficulty.Gold, MissionGoal.Reach, "axis:social.invite_joined", 1, 1, 1, 400, weight = 1),
    )

    public fun template(key: String): MissionTemplate? = templates.firstOrNull { it.key == key }
}
