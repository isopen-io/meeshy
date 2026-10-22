package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Post kind — port of PostType (StoryModels.swift). */
@Serializable
enum class PostType {
    @SerialName("POST") POST,
    @SerialName("REEL") REEL,
    @SerialName("STORY") STORY,
    @SerialName("STATUS") STATUS,
}
