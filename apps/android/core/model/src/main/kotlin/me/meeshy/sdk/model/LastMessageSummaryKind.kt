package me.meeshy.sdk.model

/** How to summarize a conversation's last message in a list row — port of LastMessageSummaryKind (LastMessageSummaryKind.swift). */
enum class LastMessageSummaryKind {
    /** Normally displayable content (text / attachments). */
    STANDARD,

    /** Blurred message — content must not be exposed. */
    HIDDEN,

    /** View-once message — content must not be exposed. */
    VIEW_ONCE,

    /** Ephemeral message past its expiration date. */
    EXPIRED,

    /** Ephemeral message still readable (future expiration). */
    EPHEMERAL_ACTIVE,
}
