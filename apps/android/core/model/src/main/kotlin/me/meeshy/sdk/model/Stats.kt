package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Aggregate user stats — port of UserStats (StatsModels.swift). */
@Serializable
data class UserStats(
    val totalMessages: Int = 0,
    val totalConversations: Int = 0,
    val totalTranslations: Int = 0,
    val friendRequestsReceived: Int = 0,
    val languagesUsed: Int = 0,
    val memberDays: Int = 0,
    val languages: List<String> = emptyList(),
    val achievements: List<Achievement> = emptyList(),
)

/** A user achievement — port of Achievement (StatsModels.swift). */
@Serializable
data class Achievement(
    val id: String,
    val name: String = "",
    val description: String = "",
    val icon: String = "",
    val color: String = "",
    val isUnlocked: Boolean = false,
    val progress: Double = 0.0,
    val threshold: Int = 0,
    val current: Int = 0,
)

/** A point on a messaging activity timeline — port of TimelinePoint (StatsModels.swift). */
@Serializable
data class TimelinePoint(
    val date: String,
    val messages: Int = 0,
)
