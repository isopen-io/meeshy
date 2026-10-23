package me.meeshy.sdk.model.game

/**
 * Le titre d'une mission du jour, par `templateKey`. MIROIR de
 * `GameCopy.missionTitle` (iOS) : une trentaine de gabarits, chacun à deux
 * formes (singulier / pluriel, l'accord se choisit sur [target]) ou à une seule
 * quand la phrase ne change pas. Un gabarit que ce client ne connaît pas
 * encore reste « Un acte du rêve ».
 */
public object GameMissionTitles {

    private val agreeing: Map<String, GameTextKey> = buildMap {
        fun register(key: GameTextKey, vararg templates: String) = templates.forEach { this[it] = key }
        register(GameTextKey.MissionReactMessages, "react-messages", "duo-reactions")
        register(GameTextKey.MissionSendVoice, "send-voice", "duo-voice")
        register(GameTextKey.MissionSendTexts, "send-texts", "duo-messages")
        register(GameTextKey.MissionUseStickers, "use-stickers")
        register(GameTextKey.MissionSendAttachments, "send-attachments")
        register(
            GameTextKey.MissionWriteConversations,
            "reply-conversations", "reply-conversations-wide", "gold-reply-conversations",
        )
        register(GameTextKey.MissionCommentText, "comment-text")
        register(GameTextKey.MissionPublishStory, "publish-story", "duo-stories")
        register(GameTextKey.MissionPublishPost, "publish-post", "publish-posts")
        register(GameTextKey.MissionShareLink, "share-link")
        register(GameTextKey.MissionPrismForeignMessages, "prism-foreign-messages", "duo-prism")
        register(GameTextKey.MissionVoiceComments, "voice-comments")
        register(GameTextKey.MissionPublishReel, "publish-reel")
        register(GameTextKey.MissionReactPosts, "react-posts")
        register(GameTextKey.MissionReplyStory, "reply-story")
        register(GameTextKey.MissionJoinCommunity, "join-community")
        register(GameTextKey.MissionWriteSomeoneNew, "write-someone-new")
        register(GameTextKey.MissionStartConversation, "start-conversation")
        register(GameTextKey.MissionCommunityHello, "community-hello")
        register(GameTextKey.MissionCommentStrangerPost, "comment-stranger-post")
        register(GameTextKey.MissionCrossLanguageChat, "cross-language-chat")
        register(GameTextKey.MissionReplyTheirLanguage, "reply-their-language")
        register(GameTextKey.MissionCreateInviteLink, "create-invite-link")
        register(GameTextKey.MissionInviteContact, "invite-contact")
        register(GameTextKey.MissionInviteJoined, "invite-joined")
    }

    private val fixed: Map<String, GameTextKey> = mapOf(
        "duo-replies" to GameTextKey.MissionReplyConversations,
        "prism-foreign-exchange" to GameTextKey.MissionPrismForeignExchange,
        "long-chat" to GameTextKey.MissionLongChat,
        "gold-replies-received" to GameTextKey.MissionGoldRepliesReceived,
    )

    /** Tous les gabarits que ce client sait dire. */
    public val knownTemplates: Set<String> = agreeing.keys + fixed.keys

    public fun title(templateKey: String, target: Int): GameText {
        val count = GameTextArg.Count(target)
        agreeing[templateKey]?.let { return GameText.of(it, count) }
        fixed[templateKey]?.let { return GameText.of(it, count) }
        return GameText(GameTextKey.MissionGeneric)
    }
}
