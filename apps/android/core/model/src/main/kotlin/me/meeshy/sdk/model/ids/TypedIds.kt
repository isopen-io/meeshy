package me.meeshy.sdk.model.ids

import kotlinx.serialization.Serializable

@JvmInline
@Serializable
public value class ConversationId(public val value: String) {
    override fun toString(): String = value
}

@JvmInline
@Serializable
public value class UserId(public val value: String) {
    override fun toString(): String = value
}

@JvmInline
@Serializable
public value class MessageId(public val value: String) {
    override fun toString(): String = value
}

@JvmInline
@Serializable
public value class PostId(public val value: String) {
    override fun toString(): String = value
}

@JvmInline
@Serializable
public value class StoryId(public val value: String) {
    override fun toString(): String = value
}
