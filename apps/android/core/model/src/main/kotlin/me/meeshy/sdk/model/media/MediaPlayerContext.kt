package me.meeshy.sdk.model.media

/** Où un lecteur média est rendu ; fixe rayon et chrome. Miroir d'iOS `MediaPlayerContext`. */
public enum class MediaPlayerContext(public val cornerRadiusDp: Int) {
    MESSAGE_BUBBLE(14),
    COMPOSER_ATTACHMENT(12),
    FEED_POST(18),
    STORY_OVERLAY(0),
    FULLSCREEN(0),
    ;

    public val isCompact: Boolean get() = this == MESSAGE_BUBBLE
    public val isEditable: Boolean get() = this == COMPOSER_ATTACHMENT
    public val showsSocialActions: Boolean get() = this == FEED_POST
    public val isImmersive: Boolean get() = this == STORY_OVERLAY || this == FULLSCREEN
    public val showsDeleteButton: Boolean get() = this == COMPOSER_ATTACHMENT
}
