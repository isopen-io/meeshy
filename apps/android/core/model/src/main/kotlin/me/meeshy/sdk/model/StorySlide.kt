package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A single story slide — port of StorySlide (StoryModels.swift). */
@Serializable
data class StorySlide(
    val id: String,
    val mediaURL: String? = null,
    val content: String? = null,
    @Serializable(with = StoryEffectsWireSerializer::class)
    val effects: StoryEffects = StoryEffects(),
    val duration: Double = 12.0,
    val order: Int = 0,
)
