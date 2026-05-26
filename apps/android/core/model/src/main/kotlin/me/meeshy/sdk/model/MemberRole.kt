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

    companion object {
        fun from(raw: String?): MemberRole =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: MEMBER
    }
}
