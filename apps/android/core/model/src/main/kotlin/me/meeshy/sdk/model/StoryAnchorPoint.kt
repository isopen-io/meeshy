package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A 2D anchor point in normalised canvas coords — port of CGPoint usage in StoryModels.swift. */
@Serializable
data class StoryAnchorPoint(
    val x: Double = 0.5,
    val y: Double = 0.5,
)
