import Foundation

// MARK: - Trait Score

public struct TraitScore: Codable, Sendable {
    public let label: String
    public let score: Int

    public init(label: String, score: Int) {
        self.label = label; self.score = score
    }
}

// MARK: - Communication Traits

public struct CommunicationTraits: Codable, Sendable {
    public let verbosity: TraitScore?
    public let formality: TraitScore?
    public let responseSpeed: TraitScore?
    public let initiativeRate: TraitScore?
    public let clarity: TraitScore?
    public let argumentation: TraitScore?

    public init(
        verbosity: TraitScore? = nil, formality: TraitScore? = nil,
        responseSpeed: TraitScore? = nil, initiativeRate: TraitScore? = nil,
        clarity: TraitScore? = nil, argumentation: TraitScore? = nil
    ) {
        self.verbosity = verbosity; self.formality = formality
        self.responseSpeed = responseSpeed; self.initiativeRate = initiativeRate
        self.clarity = clarity; self.argumentation = argumentation
    }
}

// MARK: - Personality Traits

public struct PersonalityTraits: Codable, Sendable {
    public let socialStyle: TraitScore?
    public let assertiveness: TraitScore?
    public let agreeableness: TraitScore?
    public let humor: TraitScore?
    public let emotionality: TraitScore?
    public let openness: TraitScore?
    public let confidence: TraitScore?
    public let creativity: TraitScore?
    public let patience: TraitScore?
    public let adaptability: TraitScore?

    public init(
        socialStyle: TraitScore? = nil, assertiveness: TraitScore? = nil,
        agreeableness: TraitScore? = nil, humor: TraitScore? = nil,
        emotionality: TraitScore? = nil, openness: TraitScore? = nil,
        confidence: TraitScore? = nil, creativity: TraitScore? = nil,
        patience: TraitScore? = nil, adaptability: TraitScore? = nil
    ) {
        self.socialStyle = socialStyle; self.assertiveness = assertiveness
        self.agreeableness = agreeableness; self.humor = humor
        self.emotionality = emotionality; self.openness = openness
        self.confidence = confidence; self.creativity = creativity
        self.patience = patience; self.adaptability = adaptability
    }
}

// MARK: - Interpersonal Traits

public struct InterpersonalTraits: Codable, Sendable {
    public let empathy: TraitScore?
    public let politeness: TraitScore?
    public let leadership: TraitScore?
    public let conflictStyle: TraitScore?
    public let supportiveness: TraitScore?
    public let diplomacy: TraitScore?
    public let trustLevel: TraitScore?

    public init(
        empathy: TraitScore? = nil, politeness: TraitScore? = nil,
        leadership: TraitScore? = nil, conflictStyle: TraitScore? = nil,
        supportiveness: TraitScore? = nil, diplomacy: TraitScore? = nil,
        trustLevel: TraitScore? = nil
    ) {
        self.empathy = empathy; self.politeness = politeness
        self.leadership = leadership; self.conflictStyle = conflictStyle
        self.supportiveness = supportiveness; self.diplomacy = diplomacy
        self.trustLevel = trustLevel
    }
}

// MARK: - Emotional Traits

public struct EmotionalTraits: Codable, Sendable {
    public let emotionalStability: TraitScore?
    public let positivity: TraitScore?
    public let sensitivity: TraitScore?
    public let stressResponse: TraitScore?

    public init(
        emotionalStability: TraitScore? = nil, positivity: TraitScore? = nil,
        sensitivity: TraitScore? = nil, stressResponse: TraitScore? = nil
    ) {
        self.emotionalStability = emotionalStability; self.positivity = positivity
        self.sensitivity = sensitivity; self.stressResponse = stressResponse
    }
}

// MARK: - Participant Traits

public struct ParticipantTraits: Codable, Sendable {
    public let communication: CommunicationTraits?
    public let personality: PersonalityTraits?
    public let interpersonal: InterpersonalTraits?
    public let emotional: EmotionalTraits?

    public init(
        communication: CommunicationTraits? = nil, personality: PersonalityTraits? = nil,
        interpersonal: InterpersonalTraits? = nil, emotional: EmotionalTraits? = nil
    ) {
        self.communication = communication; self.personality = personality
        self.interpersonal = interpersonal; self.emotional = emotional
    }
}

// MARK: - Relationship Attitude

public struct RelationshipAttitude: Codable, Sendable {
    public let attitude: String
    public let score: Int
    public let detail: String

    public init(attitude: String, score: Int, detail: String) {
        self.attitude = attitude; self.score = score; self.detail = detail
    }
}

// MARK: - Conversation Analysis (Agent)

public struct ConversationAnalysis: Codable, Sendable {
    public let conversationId: String
    public let summary: ConversationSummaryAnalysis?
    public let participantProfiles: [ParticipantProfile]
    public let history: [AnalysisSnapshot]

    public init(
        conversationId: String, summary: ConversationSummaryAnalysis? = nil,
        participantProfiles: [ParticipantProfile] = [], history: [AnalysisSnapshot] = []
    ) {
        self.conversationId = conversationId; self.summary = summary
        self.participantProfiles = participantProfiles; self.history = history
    }
}

// MARK: - Conversation Summary

public struct ConversationSummaryAnalysis: Codable, Sendable {
    public let text: String
    public let currentTopics: [String]
    public let overallTone: String
    public let messageCount: Int
    public let updatedAt: String?
    public let healthScore: Int?
    public let engagementLevel: String?
    public let conflictLevel: String?
    public let dynamique: String?
    public let dominantEmotions: [String]

    public init(
        text: String, currentTopics: [String] = [], overallTone: String = "",
        messageCount: Int = 0, updatedAt: String? = nil, healthScore: Int? = nil,
        engagementLevel: String? = nil, conflictLevel: String? = nil,
        dynamique: String? = nil, dominantEmotions: [String] = []
    ) {
        self.text = text; self.currentTopics = currentTopics
        self.overallTone = overallTone; self.messageCount = messageCount
        self.updatedAt = updatedAt; self.healthScore = healthScore
        self.engagementLevel = engagementLevel; self.conflictLevel = conflictLevel
        self.dynamique = dynamique; self.dominantEmotions = dominantEmotions
    }
}

// MARK: - Participant Profile (Agent Analysis)

public struct ParticipantProfile: Codable, Identifiable, Sendable {
    public var id: String { userId }
    public let userId: String
    public let username: String?
    public let displayName: String?
    public let avatar: String?
    public let personaSummary: String
    public let tone: String
    public let vocabularyLevel: String
    public let typicalLength: String
    public let emojiUsage: String
    public let topicsOfExpertise: [String]
    public let catchphrases: [String]
    public let commonEmojis: [String]
    public let reactionPatterns: [String]
    public let messagesAnalyzed: Int
    public let confidence: Double
    public let traits: ParticipantTraits?
    public let dominantEmotions: [String]
    public let relationshipMap: [String: RelationshipAttitude]?
    public let sentimentScore: Double?
    public let engagementLevel: String?
    public let locked: Bool?

    public init(
        userId: String, username: String? = nil, displayName: String? = nil,
        avatar: String? = nil, personaSummary: String = "", tone: String = "",
        vocabularyLevel: String = "", typicalLength: String = "",
        emojiUsage: String = "", topicsOfExpertise: [String] = [],
        catchphrases: [String] = [], commonEmojis: [String] = [],
        reactionPatterns: [String] = [], messagesAnalyzed: Int = 0,
        confidence: Double = 0, traits: ParticipantTraits? = nil,
        dominantEmotions: [String] = [], relationshipMap: [String: RelationshipAttitude]? = nil,
        sentimentScore: Double? = nil, engagementLevel: String? = nil,
        locked: Bool? = nil
    ) {
        self.userId = userId; self.username = username
        self.displayName = displayName; self.avatar = avatar
        self.personaSummary = personaSummary; self.tone = tone
        self.vocabularyLevel = vocabularyLevel; self.typicalLength = typicalLength
        self.emojiUsage = emojiUsage; self.topicsOfExpertise = topicsOfExpertise
        self.catchphrases = catchphrases; self.commonEmojis = commonEmojis
        self.reactionPatterns = reactionPatterns; self.messagesAnalyzed = messagesAnalyzed
        self.confidence = confidence; self.traits = traits
        self.dominantEmotions = dominantEmotions; self.relationshipMap = relationshipMap
        self.sentimentScore = sentimentScore; self.engagementLevel = engagementLevel
        self.locked = locked
    }
}

// MARK: - Analysis Snapshot

public struct AnalysisSnapshot: Codable, Identifiable, Sendable {
    public var id: String { snapshotDate }
    public let snapshotDate: String
    public let overallTone: String
    public let healthScore: Int?
    public let engagementLevel: String?
    public let conflictLevel: String?
    public let topTopics: [String]
    public let dominantEmotions: [String]
    public let messageCountAtSnapshot: Int
    public let participantSnapshots: [ParticipantSnapshot]

    public init(
        snapshotDate: String, overallTone: String = "", healthScore: Int? = nil,
        engagementLevel: String? = nil, conflictLevel: String? = nil,
        topTopics: [String] = [], dominantEmotions: [String] = [],
        messageCountAtSnapshot: Int = 0, participantSnapshots: [ParticipantSnapshot] = []
    ) {
        self.snapshotDate = snapshotDate; self.overallTone = overallTone
        self.healthScore = healthScore; self.engagementLevel = engagementLevel
        self.conflictLevel = conflictLevel; self.topTopics = topTopics
        self.dominantEmotions = dominantEmotions; self.messageCountAtSnapshot = messageCountAtSnapshot
        self.participantSnapshots = participantSnapshots
    }
}

// MARK: - Participant Snapshot

public struct ParticipantSnapshot: Codable, Sendable {
    public let userId: String
    public let displayName: String?
    public let sentimentScore: Double?
    public let positivityScore: Int?
    public let socialStyleScore: Int?
    public let assertivenessScore: Int?

    public init(
        userId: String, displayName: String? = nil, sentimentScore: Double? = nil,
        positivityScore: Int? = nil, socialStyleScore: Int? = nil,
        assertivenessScore: Int? = nil
    ) {
        self.userId = userId; self.displayName = displayName
        self.sentimentScore = sentimentScore; self.positivityScore = positivityScore
        self.socialStyleScore = socialStyleScore; self.assertivenessScore = assertivenessScore
    }
}

// MARK: - Conversation Message Stats

public struct ConversationMessageStatsResponse: Codable, Sendable {
    public let conversationId: String
    public let totalMessages: Int
    public let totalWords: Int
    public let totalCharacters: Int
    public let contentTypes: ContentTypeCounts
    public let participantStats: [ParticipantStatEntry]
    public let dailyActivity: [DailyActivityEntry]
    public let hourlyDistribution: [String: Int]
    public let languageDistribution: [LanguageEntry]
    public let updatedAt: String?

    public init(
        conversationId: String, totalMessages: Int = 0, totalWords: Int = 0,
        totalCharacters: Int = 0, contentTypes: ContentTypeCounts = ContentTypeCounts(),
        participantStats: [ParticipantStatEntry] = [], dailyActivity: [DailyActivityEntry] = [],
        hourlyDistribution: [String: Int] = [:], languageDistribution: [LanguageEntry] = [],
        updatedAt: String? = nil
    ) {
        self.conversationId = conversationId; self.totalMessages = totalMessages
        self.totalWords = totalWords; self.totalCharacters = totalCharacters
        self.contentTypes = contentTypes; self.participantStats = participantStats
        self.dailyActivity = dailyActivity; self.hourlyDistribution = hourlyDistribution
        self.languageDistribution = languageDistribution; self.updatedAt = updatedAt
    }
}

// MARK: - Content Type Counts

public struct ContentTypeCounts: Codable, Sendable {
    public let text: Int
    public let image: Int
    public let audio: Int
    public let video: Int
    public let file: Int
    public let location: Int

    public init(
        text: Int = 0, image: Int = 0, audio: Int = 0,
        video: Int = 0, file: Int = 0, location: Int = 0
    ) {
        self.text = text; self.image = image; self.audio = audio
        self.video = video; self.file = file; self.location = location
    }
}

// MARK: - Participant Stat Entry

public struct ParticipantStatEntry: Codable, Sendable {
    public let userId: String
    public let name: String?
    public let messageCount: Int
    public let wordCount: Int
    public let firstMessageAt: String?
    public let lastMessageAt: String?

    public init(
        userId: String, name: String? = nil, messageCount: Int = 0,
        wordCount: Int = 0, firstMessageAt: String? = nil, lastMessageAt: String? = nil
    ) {
        self.userId = userId; self.name = name
        self.messageCount = messageCount; self.wordCount = wordCount
        self.firstMessageAt = firstMessageAt; self.lastMessageAt = lastMessageAt
    }
}

// MARK: - Daily Activity Entry

public struct DailyActivityEntry: Codable, Sendable {
    public let date: String
    public let count: Int

    public init(date: String, count: Int = 0) {
        self.date = date; self.count = count
    }
}

// MARK: - Language Entry

public struct LanguageEntry: Codable, Sendable {
    public let language: String
    public let count: Int

    public init(language: String, count: Int = 0) {
        self.language = language; self.count = count
    }
}
