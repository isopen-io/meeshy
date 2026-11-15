package me.meeshy.sdk.model.game.engagement

/**
 * Les clés FERMÉES de l'engagement — MIROIR de `packages/shared/types/engagement.ts` et de
 * `EngagementCatalog.swift`. Un axe est une clé stable (`EngagementCounter.axisKey`) ; la
 * famille EST son préfixe, aucune table à tenir en miroir.
 */
public enum class EngagementAxisFamily(public val wire: String) {
    CONTENT("content"),
    COMMENT("comment"),
    CONVERSATION("conversation"),
    TOOL("tool"),
    SOCIAL("social"),
    ;

    public companion object {
        public fun fromWire(raw: String?): EngagementAxisFamily? = entries.firstOrNull { it.wire == raw }
    }
}

/** Les vingt axes, dans l'ordre du catalogue TypeScript (`ENGAGEMENT_AXES`). */
public enum class EngagementAxisKey(public val wire: String, public val weight: Int) {
    AUDIO_MESSAGE("content.audio_message", EngagementCatalog.CONTENT_WEIGHT),
    TEXT_MESSAGE("content.text_message", EngagementCatalog.CONTENT_WEIGHT),
    POST("content.post", EngagementCatalog.CONTENT_WEIGHT),
    STORY("content.story", EngagementCatalog.CONTENT_WEIGHT),
    REEL("content.reel", EngagementCatalog.CONTENT_WEIGHT),
    AUDIO_COMMENT("comment.audio", EngagementCatalog.COMMENT_WEIGHT),
    TEXT_COMMENT("comment.text", EngagementCatalog.COMMENT_WEIGHT),
    PRIVATE_CONVERSATION("conversation.private", EngagementCatalog.CONVERSATION_WEIGHT),
    PUBLIC_CONVERSATION("conversation.public", EngagementCatalog.CONVERSATION_WEIGHT),
    COMMUNITY_CONVERSATION("conversation.community", EngagementCatalog.CONVERSATION_WEIGHT),
    GROUP_CREATED("conversation.group_created", EngagementCatalog.GROUP_CREATION_WEIGHT),
    STICKER("tool.sticker", EngagementCatalog.TOOL_WEIGHT),
    IN_APP_EDIT("tool.in_app_edit", EngagementCatalog.TOOL_WEIGHT),
    DIRECT_PUBLISH("tool.direct_publish", EngagementCatalog.TOOL_WEIGHT),
    REACTION("tool.reaction", EngagementCatalog.TOOL_WEIGHT),
    ATTACHMENT("tool.attachment", EngagementCatalog.TOOL_WEIGHT),
    TRACKED_LINK("social.tracked_link", EngagementCatalog.SOCIAL_WEIGHT),
    SHARE("social.share", EngagementCatalog.SOCIAL_WEIGHT),
    INVITE_JOINED("social.invite_joined", EngagementCatalog.SOCIAL_WEIGHT),
    FRIENDSHIP("social.friendship", EngagementCatalog.SOCIAL_WEIGHT),
    ;

    /** La famille EST le préfixe de la clé. */
    public val family: EngagementAxisFamily
        get() = EngagementAxisFamily.fromWire(wire.substringBefore('.')) ?: EngagementAxisFamily.CONTENT

    public companion object {
        /** Une clé inconnue (axe ajouté au serveur avant la mise à jour de l'app) se lit `null`, jamais une erreur. */
        public fun fromWire(raw: String?): EngagementAxisKey? = entries.firstOrNull { it.wire == raw }
    }
}

/** Les quatre natures de palier gravées dans `EngagementMilestone.milestoneType`. */
public enum class EngagementMilestoneType(public val wire: String) {
    BADGE("badge"),
    STREAK("streak"),
    LEVEL("level"),
    ACHIEVEMENT("achievement"),
    ;

    public companion object {
        public fun fromWire(raw: String?): EngagementMilestoneType? = entries.firstOrNull { it.wire == raw }
    }
}

/** Les cinq succès composés historiques (§ 8) — la clé EST la `milestoneKey`. */
public enum class EngagementAchievementKey(public val wire: String) {
    FIRST_CONTENT("achievement.first_content"),
    ALL_CONTENT_TYPES("achievement.all_content_types"),
    FIRST_VOICE("achievement.first_voice"),
    EDITOR("achievement.editor"),
    THREE_CONVERSATION_KINDS("achievement.three_conversation_kinds"),
    ;

    public companion object {
        public fun fromWire(raw: String?): EngagementAchievementKey? = entries.firstOrNull { it.wire == raw }
    }
}
