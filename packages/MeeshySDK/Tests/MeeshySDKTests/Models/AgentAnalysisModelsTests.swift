import XCTest
@testable import MeeshySDK

final class AgentAnalysisModelsTests: XCTestCase {

    // MARK: - TraitScore

    func test_traitScore_decodes() throws {
        let json = """
        { "label": "Verbose", "score": 8 }
        """.data(using: .utf8)!

        let trait = try JSONDecoder().decode(TraitScore.self, from: json)
        XCTAssertEqual(trait.label, "Verbose")
        XCTAssertEqual(trait.score, 8)
    }

    // MARK: - CommunicationTraits

    func test_communicationTraits_decodesAllFields() throws {
        let json = """
        {
            "verbosity": { "label": "High", "score": 9 },
            "formality": { "label": "Casual", "score": 3 },
            "responseSpeed": { "label": "Fast", "score": 8 },
            "initiativeRate": { "label": "Proactive", "score": 7 },
            "clarity": { "label": "Clear", "score": 9 },
            "argumentation": { "label": "Logical", "score": 6 }
        }
        """.data(using: .utf8)!

        let traits = try JSONDecoder().decode(CommunicationTraits.self, from: json)
        XCTAssertEqual(traits.verbosity?.score, 9)
        XCTAssertEqual(traits.formality?.label, "Casual")
        XCTAssertEqual(traits.responseSpeed?.score, 8)
        XCTAssertEqual(traits.initiativeRate?.score, 7)
        XCTAssertEqual(traits.clarity?.score, 9)
        XCTAssertEqual(traits.argumentation?.label, "Logical")
    }

    func test_communicationTraits_decodesWithAllFieldsNil() throws {
        let json = "{}".data(using: .utf8)!
        let traits = try JSONDecoder().decode(CommunicationTraits.self, from: json)
        XCTAssertNil(traits.verbosity)
        XCTAssertNil(traits.formality)
        XCTAssertNil(traits.responseSpeed)
        XCTAssertNil(traits.initiativeRate)
        XCTAssertNil(traits.clarity)
        XCTAssertNil(traits.argumentation)
    }

    // MARK: - ParticipantTraits

    func test_participantTraits_decodesNestedStructure() throws {
        let json = """
        {
            "communication": {
                "verbosity": { "label": "Moderate", "score": 5 }
            },
            "personality": {
                "humor": { "label": "Witty", "score": 7 }
            },
            "interpersonal": {
                "empathy": { "label": "High", "score": 9 }
            },
            "emotional": {
                "positivity": { "label": "Optimistic", "score": 8 }
            }
        }
        """.data(using: .utf8)!

        let traits = try JSONDecoder().decode(ParticipantTraits.self, from: json)
        XCTAssertEqual(traits.communication?.verbosity?.score, 5)
        XCTAssertEqual(traits.personality?.humor?.label, "Witty")
        XCTAssertEqual(traits.interpersonal?.empathy?.score, 9)
        XCTAssertEqual(traits.emotional?.positivity?.score, 8)
    }

    // MARK: - RelationshipAttitude

    func test_relationshipAttitude_decodes() throws {
        let json = """
        { "attitude": "friendly", "score": 8, "detail": "Always supportive in discussions" }
        """.data(using: .utf8)!

        let attitude = try JSONDecoder().decode(RelationshipAttitude.self, from: json)
        XCTAssertEqual(attitude.attitude, "friendly")
        XCTAssertEqual(attitude.score, 8)
        XCTAssertEqual(attitude.detail, "Always supportive in discussions")
    }

    // MARK: - ConversationAnalysis

    func test_conversationAnalysis_decodesFullPayload() throws {
        let json = """
        {
            "conversationId": "conv123",
            "summary": {
                "text": "A lively discussion about technology",
                "currentTopics": ["AI", "Swift"],
                "overallTone": "enthusiastic",
                "messageCount": 150,
                "updatedAt": "2026-04-01T12:00:00.000Z",
                "healthScore": 85,
                "engagementLevel": "high",
                "conflictLevel": "low",
                "dynamique": "collaborative",
                "dominantEmotions": ["joy", "curiosity"]
            },
            "participantProfiles": [
                {
                    "userId": "user1",
                    "username": "alice",
                    "displayName": "Alice",
                    "avatar": "https://img.test/alice.png",
                    "personaSummary": "Enthusiastic developer",
                    "tone": "friendly",
                    "vocabularyLevel": "advanced",
                    "typicalLength": "medium",
                    "emojiUsage": "frequent",
                    "topicsOfExpertise": ["iOS", "SwiftUI"],
                    "catchphrases": ["let's ship it"],
                    "commonEmojis": ["🚀"],
                    "reactionPatterns": ["thumbs_up"],
                    "messagesAnalyzed": 75,
                    "confidence": 0.92,
                    "dominantEmotions": ["joy"],
                    "sentimentScore": 0.85,
                    "engagementLevel": "high",
                    "locked": false
                }
            ],
            "history": [
                {
                    "snapshotDate": "2026-04-01",
                    "overallTone": "positive",
                    "healthScore": 80,
                    "engagementLevel": "high",
                    "conflictLevel": "none",
                    "topTopics": ["SwiftUI"],
                    "dominantEmotions": ["enthusiasm"],
                    "messageCountAtSnapshot": 100,
                    "participantSnapshots": [
                        {
                            "userId": "user1",
                            "displayName": "Alice",
                            "sentimentScore": 0.9,
                            "positivityScore": 8,
                            "socialStyleScore": 7,
                            "assertivenessScore": 6
                        }
                    ]
                }
            ]
        }
        """.data(using: .utf8)!

        let analysis = try JSONDecoder().decode(ConversationAnalysis.self, from: json)
        XCTAssertEqual(analysis.conversationId, "conv123")
        XCTAssertEqual(analysis.summary?.text, "A lively discussion about technology")
        XCTAssertEqual(analysis.summary?.currentTopics, ["AI", "Swift"])
        XCTAssertEqual(analysis.summary?.healthScore, 85)
        XCTAssertEqual(analysis.summary?.dominantEmotions, ["joy", "curiosity"])
        XCTAssertEqual(analysis.participantProfiles.count, 1)
        XCTAssertEqual(analysis.participantProfiles[0].userId, "user1")
        XCTAssertEqual(analysis.participantProfiles[0].username, "alice")
        XCTAssertEqual(analysis.participantProfiles[0].confidence, 0.92, accuracy: 0.001)
        XCTAssertEqual(analysis.participantProfiles[0].id, "user1")
        XCTAssertEqual(analysis.history.count, 1)
        XCTAssertEqual(analysis.history[0].snapshotDate, "2026-04-01")
        XCTAssertEqual(analysis.history[0].participantSnapshots.count, 1)
        XCTAssertEqual(analysis.history[0].participantSnapshots[0].sentimentScore, 0.9, accuracy: 0.001)
    }

    func test_conversationAnalysis_decodesMinimalPayload() throws {
        let json = """
        {
            "conversationId": "conv456",
            "participantProfiles": [],
            "history": []
        }
        """.data(using: .utf8)!

        let analysis = try JSONDecoder().decode(ConversationAnalysis.self, from: json)
        XCTAssertEqual(analysis.conversationId, "conv456")
        XCTAssertNil(analysis.summary)
        XCTAssertTrue(analysis.participantProfiles.isEmpty)
        XCTAssertTrue(analysis.history.isEmpty)
    }

    // MARK: - ConversationMessageStatsResponse

    func test_conversationMessageStats_decodesFullPayload() throws {
        let json = """
        {
            "conversationId": "conv789",
            "totalMessages": 500,
            "totalWords": 12000,
            "totalCharacters": 65000,
            "contentTypes": {
                "text": 450,
                "image": 30,
                "audio": 10,
                "video": 5,
                "file": 3,
                "location": 2
            },
            "participantStats": [
                {
                    "userId": "user1",
                    "name": "Alice",
                    "messageCount": 250,
                    "wordCount": 6000,
                    "firstMessageAt": "2026-01-01T00:00:00.000Z",
                    "lastMessageAt": "2026-04-01T12:00:00.000Z"
                }
            ],
            "dailyActivity": [
                { "date": "2026-04-01", "count": 25 }
            ],
            "hourlyDistribution": { "9": 15, "14": 30, "20": 10 },
            "languageDistribution": [
                { "language": "fr", "count": 300 },
                { "language": "en", "count": 200 }
            ],
            "updatedAt": "2026-04-01T15:00:00.000Z"
        }
        """.data(using: .utf8)!

        let stats = try JSONDecoder().decode(ConversationMessageStatsResponse.self, from: json)
        XCTAssertEqual(stats.conversationId, "conv789")
        XCTAssertEqual(stats.totalMessages, 500)
        XCTAssertEqual(stats.totalWords, 12000)
        XCTAssertEqual(stats.contentTypes.text, 450)
        XCTAssertEqual(stats.contentTypes.image, 30)
        XCTAssertEqual(stats.participantStats.count, 1)
        XCTAssertEqual(stats.participantStats[0].name, "Alice")
        XCTAssertEqual(stats.dailyActivity.count, 1)
        XCTAssertEqual(stats.hourlyDistribution["14"], 30)
        XCTAssertEqual(stats.languageDistribution.count, 2)
        XCTAssertEqual(stats.updatedAt, "2026-04-01T15:00:00.000Z")
    }

    // MARK: - ParticipantSnapshot

    func test_participantSnapshot_decodesWithOptionalFields() throws {
        let json = """
        {
            "userId": "user1",
            "displayName": null,
            "sentimentScore": null,
            "positivityScore": null,
            "socialStyleScore": null,
            "assertivenessScore": null
        }
        """.data(using: .utf8)!

        let snapshot = try JSONDecoder().decode(ParticipantSnapshot.self, from: json)
        XCTAssertEqual(snapshot.userId, "user1")
        XCTAssertNil(snapshot.displayName)
        XCTAssertNil(snapshot.sentimentScore)
        XCTAssertNil(snapshot.positivityScore)
    }
}
