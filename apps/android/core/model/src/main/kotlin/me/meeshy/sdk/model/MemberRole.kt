package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Roles of a member in a conversation or community — port of MemberRole (MemberRole.swift). */
@Serializable
enum class MemberRole(val level: Int) {
    @SerialName("creator")
    CREATOR(40),

    @SerialName("admin")
    ADMIN(30),

    @SerialName("moderator")
    MODERATOR(20),

    @SerialName("member")
    MEMBER(10);

    fun hasMinimumRole(required: MemberRole): Boolean = level >= required.level

    /**
     * The lowercase wire value the gateway expects (matches each entry's
     * [SerialName]). SSOT for encoding a role back onto an API request body — e.g.
     * the conversation-settings `defaultWriteRole` patch — so no call site
     * hand-writes the string.
     */
    val wireValue: String get() = name.lowercase()

    companion object {
        fun from(raw: String?): MemberRole =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: MEMBER
    }
}
