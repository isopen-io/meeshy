package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A geographic coordinate — port of MeeshyLocationCoordinate (LocationModels.swift). */
@Serializable
data class MeeshyLocationCoordinate(
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val altitude: Double? = null,
    val accuracy: Double? = null,
)

@Serializable
data class LiveLocationStartedEvent(
    val conversationId: String = "",
    val userId: String = "",
    val username: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val durationMinutes: Int = 0,
    val expiresAt: String? = null,
    val startedAt: String? = null,
)

@Serializable
data class LiveLocationUpdatedEvent(
    val conversationId: String = "",
    val userId: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val altitude: Double? = null,
    val accuracy: Double? = null,
    val speed: Double? = null,
    val heading: Double? = null,
    val timestamp: String? = null,
)

@Serializable
data class LiveLocationStoppedEvent(
    val conversationId: String = "",
    val userId: String = "",
    val stoppedAt: String? = null,
)
