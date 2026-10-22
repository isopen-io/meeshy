package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A transform applied to the background media — port of StoryBackgroundTransform (StoryModels.swift). */
@Serializable
data class StoryBackgroundTransform(
    val scale: Double? = null,
    val offsetX: Double? = null,
    val offsetY: Double? = null,
    val rotation: Double? = null,
)
