package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Conversation agent analysis models — port of AgentAnalysisModels.swift. */
@Serializable
data class TraitScore(
    val label: String,
    val score: Int = 0,
)

@Serializable
data class CommunicationTraits(
    val verbosity: TraitScore? = null,
    val formality: TraitScore? = null,
    val responseSpeed: TraitScore? = null,
    val initiativeRate: TraitScore? = null,
    val clarity: TraitScore? = null,
    val argumentation: TraitScore? = null,
)

@Serializable
data class PersonalityTraits(
    val socialStyle: TraitScore? = null,
    val assertiveness: TraitScore? = null,
    val agreeableness: TraitScore? = null,
    val humor: TraitScore? = null,
    val emotionality: TraitScore? = null,
    val openness: TraitScore? = null,
    val confidence: TraitScore? = null,
    val creativity: TraitScore? = null,
    val patience: TraitScore? = null,
    val adaptability: TraitScore? = null,
)

@Serializable
data class InterpersonalTraits(
    val empathy: TraitScore? = null,
    val politeness: TraitScore? = null,
    val leadership: TraitScore? = null,
    val conflictStyle: TraitScore? = null,
    val supportiveness: TraitScore? = null,
    val diplomacy: TraitScore? = null,
    val trustLevel: TraitScore? = null,
)

@Serializable
data class EmotionalTraits(
    val emotionalStability: TraitScore? = null,
    val positivity: TraitScore? = null,
    val sensitivity: TraitScore? = null,
    val stressResponse: TraitScore? = null,
)

@Serializable
data class ParticipantTraits(
    val communication: CommunicationTraits? = null,
    val personality: PersonalityTraits? = null,
    val interpersonal: InterpersonalTraits? = null,
    val emotional: EmotionalTraits? = null,
)

@Serializable
data class RelationshipAttitude(
    val attitude: String,
    val score: Int = 0,
    val detail: String = "",
)

@Serializable
data class ConversationAnalysis(
    val conversationId: String,
    val summary: ConversationSummaryAnalysis? = null,
    val participantProfiles: List<ParticipantProfile> = emptyList(),
    val history: List<AnalysisSnapshot> = emptyList(),
)

@Serializable
data class ConversationSummaryAnalysis(
    val text: String,
    val currentTopics: List<String> = emptyList(),
    val overallTone: String = "",
    val messageCount: Int = 0,
    val updatedAt: String? = null,
    val healthScore: Int? = null,
    val engagementLevel: String? = null,
    val conflictLevel: String? = null,
    val dynamique: String? = null,
    val dominantEmotions: List<String> = emptyList(),
)

@Serializable
data class ParticipantProfile(
    val userId: String,
    val username: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    val personaSummary: String = "",
    val tone: String = "",
    val vocabularyLevel: String = "",
    val typicalLength: String = "",
    val emojiUsage: String = "",
    val topicsOfExpertise: List<String> = emptyList(),
    val catchphrases: List<String> = emptyList(),
    val commonEmojis: List<String> = emptyList(),
    val reactionPatterns: List<String> = emptyList(),
    val messagesAnalyzed: Int = 0,
    val confidence: Double = 0.0,
    val traits: ParticipantTraits? = null,
    val dominantEmotions: List<String> = emptyList(),
    val relationshipMap: Map<String, RelationshipAttitude>? = null,
    val sentimentScore: Double? = null,
    val engagementLevel: String? = null,
    val locked: Boolean? = null,
)

@Serializable
data class AnalysisSnapshot(
    val snapshotDate: String,
    val overallTone: String = "",
    val healthScore: Int? = null,
    val engagementLevel: String? = null,
    val conflictLevel: String? = null,
    val topTopics: List<String> = emptyList(),
    val dominantEmotions: List<String> = emptyList(),
    val messageCountAtSnapshot: Int = 0,
    val participantSnapshots: List<ParticipantSnapshot> = emptyList(),
)

@Serializable
data class ParticipantSnapshot(
    val userId: String,
    val displayName: String? = null,
    val sentimentScore: Double? = null,
    val positivityScore: Int? = null,
    val socialStyleScore: Int? = null,
    val assertivenessScore: Int? = null,
)

@Serializable
data class ConversationMessageStatsResponse(
    val conversationId: String,
    val totalMessages: Int = 0,
    val totalWords: Int = 0,
    val totalCharacters: Int = 0,
    val contentTypes: ContentTypeCounts = ContentTypeCounts(),
    val participantStats: List<ParticipantStatEntry> = emptyList(),
    val dailyActivity: List<DailyActivityEntry> = emptyList(),
    val hourlyDistribution: Map<String, Int> = emptyMap(),
    val languageDistribution: List<LanguageEntry> = emptyList(),
    val updatedAt: String? = null,
)

@Serializable
data class ContentTypeCounts(
    val text: Int = 0,
    val image: Int = 0,
    val audio: Int = 0,
    val video: Int = 0,
    val file: Int = 0,
    val location: Int = 0,
)

@Serializable
data class ParticipantStatEntry(
    val userId: String,
    val name: String? = null,
    val messageCount: Int = 0,
    val wordCount: Int = 0,
    val firstMessageAt: String? = null,
    val lastMessageAt: String? = null,
)

@Serializable
data class DailyActivityEntry(
    val date: String,
    val count: Int = 0,
)

@Serializable
data class LanguageEntry(
    val language: String,
    val count: Int = 0,
)
