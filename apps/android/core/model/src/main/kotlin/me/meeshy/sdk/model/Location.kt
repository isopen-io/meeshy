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

/** Static location share payload — port of LocationSharePayload (LocationModels.swift). */
@Serializable
data class LocationSharePayload(
    val conversationId: String,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val altitude: Double? = null,
    val accuracy: Double? = null,
    val placeName: String? = null,
    val address: String? = null,
)

@Serializable
data class LocationSharedEvent(
    val messageId: String = "",
    val conversationId: String = "",
    val userId: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val altitude: Double? = null,
    val accuracy: Double? = null,
    val placeName: String? = null,
    val address: String? = null,
    val timestamp: String? = null,
)

@Serializable
data class LiveLocationStartPayload(
    val conversationId: String,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val durationMinutes: Int = 0,
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
data class LiveLocationUpdatePayload(
    val conversationId: String,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val altitude: Double? = null,
    val accuracy: Double? = null,
    val speed: Double? = null,
    val heading: Double? = null,
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
