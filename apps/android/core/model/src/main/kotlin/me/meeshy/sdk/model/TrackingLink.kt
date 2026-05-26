package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A tracking link — port of TrackingLink (TrackingLinkModels.swift). */
@Serializable
data class TrackingLink(
    val id: String,
    val token: String = "",
    val name: String? = null,
    val campaign: String? = null,
    val source: String? = null,
    val medium: String? = null,
    val originalUrl: String = "",
    val shortUrl: String = "",
    val totalClicks: Int = 0,
    val uniqueClicks: Int = 0,
    val isActive: Boolean = false,
    val expiresAt: String? = null,
    val createdAt: String? = null,
    val lastClickedAt: String? = null,
)

/** A click on a tracking link — port of TrackingLinkClick (TrackingLinkModels.swift). */
@Serializable
data class TrackingLinkClick(
    val id: String,
    val country: String? = null,
    val city: String? = null,
    val device: String? = null,
    val browser: String? = null,
    val os: String? = null,
    val referrer: String? = null,
    val socialSource: String? = null,
    val redirectStatus: String = "",
    val clickedAt: String? = null,
)

@Serializable
data class TrackingLinkDetail(
    val link: TrackingLink,
    val clicks: List<TrackingLinkClick> = emptyList(),
    val total: Int = 0,
)

@Serializable
data class TrackingLinkStats(
    val totalLinks: Int = 0,
    val totalClicks: Int = 0,
    val uniqueClicks: Int = 0,
    val activeLinks: Int = 0,
)

@Serializable
data class CreateTrackingLinkRequest(
    val name: String? = null,
    val originalUrl: String,
    val campaign: String? = null,
    val source: String? = null,
    val medium: String? = null,
    val token: String? = null,
    val expiresAt: String? = null,
)
