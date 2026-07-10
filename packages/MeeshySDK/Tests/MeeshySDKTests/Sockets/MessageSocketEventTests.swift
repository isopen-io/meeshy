import XCTest
@testable import MeeshySDK

final class MessageSocketEventTests: XCTestCase {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: dateStr) { return date }
            iso.formatOptions = [.withInternetDateTime]
            if let date = iso.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid date: \(dateStr)"
            )
        }
        return d
    }()

    // MARK: - MessageDeletedEvent

    func testMessageDeletedEventDecoding() throws {
        let json = """
        {"messageId": "abc123", "conversationId": "conv456"}
        """.data(using: .utf8)!

        let event = try decoder.decode(MessageDeletedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "abc123")
        XCTAssertEqual(event.conversationId, "conv456")
    }

    // MARK: - MessagePinnedEvent / MessageUnpinnedEvent

    func testMessagePinnedEventDecoding() throws {
        let json = """
        {"messageId": "m1", "conversationId": "c1", "pinnedBy": "u1", "pinnedAt": "2026-06-18T12:00:00.000Z"}
        """.data(using: .utf8)!

        let event = try decoder.decode(MessagePinnedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "m1")
        XCTAssertEqual(event.conversationId, "c1")
        XCTAssertEqual(event.pinnedBy, "u1")
        XCTAssertEqual(event.pinnedAt, "2026-06-18T12:00:00.000Z")
    }

    func testMessagePinnedEventDecoding_tolerantWithoutOptionalFields() throws {
        // pinnedBy/pinnedAt absents : decodage tolerant (optionnels) — le listener
        // appliquera tout de meme l'epingle (pinnedAt local par defaut cote app).
        let json = """
        {"messageId": "m2", "conversationId": "c2"}
        """.data(using: .utf8)!

        let event = try decoder.decode(MessagePinnedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "m2")
        XCTAssertNil(event.pinnedBy)
        XCTAssertNil(event.pinnedAt)
    }

    // MARK: - CallTranslatedSegmentData

    func testCallTranslatedSegmentEventDecoding() throws {
        let json = """
        {
            "callId": "507f1f77bcf86cd799439011",
            "segment": {
                "text": "Bonjour",
                "translatedText": "Hello",
                "speakerId": "user-abc",
                "startMs": 0,
                "endMs": 1500,
                "isFinal": true,
                "sourceLanguage": "fr",
                "targetLanguage": "en",
                "confidence": 0.95
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(CallTranslatedSegmentData.self, from: json)
        XCTAssertEqual(event.callId, "507f1f77bcf86cd799439011")
        XCTAssertEqual(event.segment.text, "Bonjour")
        XCTAssertEqual(event.segment.translatedText, "Hello")
        XCTAssertEqual(event.segment.speakerId, "user-abc")
        XCTAssertEqual(event.segment.startMs, 0)
        XCTAssertEqual(event.segment.endMs, 1500)
        XCTAssertTrue(event.segment.isFinal)
        XCTAssertEqual(event.segment.sourceLanguage, "fr")
        XCTAssertEqual(event.segment.targetLanguage, "en")
        XCTAssertEqual(event.segment.confidence, 0.95, accuracy: 0.001)
    }

    func testCallTranslatedSegmentEventDecoding_withoutTranslatedText_fallsBackToNil() throws {
        // `translatedText` is omitted when ZMQ translation is disabled/unavailable —
        // consumers must fall back to displaying `text`.
        let json = """
        {
            "callId": "507f1f77bcf86cd799439011",
            "segment": {
                "text": "Bonjour",
                "speakerId": "user-abc",
                "startMs": 0,
                "endMs": 1500,
                "isFinal": true,
                "sourceLanguage": "fr",
                "targetLanguage": "fr",
                "confidence": 0.95
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(CallTranslatedSegmentData.self, from: json)
        XCTAssertNil(event.segment.translatedText)
    }

    func testMessageUnpinnedEventDecoding() throws {
        let json = """
        {"messageId": "m3", "conversationId": "c3"}
        """.data(using: .utf8)!

        let event = try decoder.decode(MessageUnpinnedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "m3")
        XCTAssertEqual(event.conversationId, "c3")
    }

    // MARK: - ReactionUpdateEvent

    func testReactionUpdateEventDecoding() throws {
        let json = """
        {
            "messageId": "msg1",
            "participantId": "p1",
            "emoji": "\u{1F44D}",
            "action": "add",
            "aggregation": {
                "emoji": "\u{1F44D}",
                "count": 3,
                "participantIds": ["p1", "p2", "p3"],
                "hasCurrentUser": true
            },
            "timestamp": "2026-03-06T12:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ReactionUpdateEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg1")
        XCTAssertEqual(event.participantId, "p1")
        XCTAssertEqual(event.emoji, "\u{1F44D}")
        XCTAssertEqual(event.action, "add")
        XCTAssertEqual(event.count, 3)
        XCTAssertEqual(event.aggregation?.participantIds, ["p1", "p2", "p3"])
        XCTAssertEqual(event.aggregation?.hasCurrentUser, true)
        XCTAssertEqual(event.timestamp, "2026-03-06T12:00:00.000Z")
    }

    func testReactionUpdateEventDecodingWithNilOptionals() throws {
        let json = """
        {"messageId": "msg2", "emoji": "\u{2764}\u{FE0F}"}
        """.data(using: .utf8)!

        let event = try decoder.decode(ReactionUpdateEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg2")
        XCTAssertEqual(event.emoji, "\u{2764}\u{FE0F}")
        XCTAssertEqual(event.count, 0)
        XCTAssertNil(event.participantId)
        XCTAssertNil(event.action)
        XCTAssertNil(event.aggregation)
    }

    // MARK: - TypingEvent

    func testTypingEventDecoding() throws {
        let json = """
        {"userId": "u1", "username": "alice_handle", "displayName": "Alice Martin", "conversationId": "c1"}
        """.data(using: .utf8)!

        let event = try decoder.decode(TypingEvent.self, from: json)
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.username, "alice_handle")
        XCTAssertEqual(event.displayName, "Alice Martin")
        XCTAssertEqual(event.preferredDisplayName, "Alice Martin")
        XCTAssertEqual(event.conversationId, "c1")
    }

    func testTypingEventDecoding_missingDisplayName_preferredFallsBackToUsername() throws {
        let json = """
        {"userId": "u1", "username": "alice", "conversationId": "c1"}
        """.data(using: .utf8)!

        let event = try decoder.decode(TypingEvent.self, from: json)
        XCTAssertNil(event.displayName)
        XCTAssertEqual(event.preferredDisplayName, "alice")
    }

    // MARK: - UnreadUpdateEvent

    func testUnreadUpdateEventDecoding() throws {
        let json = """
        {"conversationId": "c1", "unreadCount": 5}
        """.data(using: .utf8)!

        let event = try decoder.decode(UnreadUpdateEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "c1")
        XCTAssertEqual(event.unreadCount, 5)
    }

    // MARK: - UserStatusEvent

    func testUserStatusEventDecodingWithDate() throws {
        let json = """
        {
            "userId": "u1",
            "username": "alice",
            "isOnline": true,
            "lastActiveAt": "2026-03-06T12:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(UserStatusEvent.self, from: json)
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.username, "alice")
        XCTAssertTrue(event.isOnline)
        XCTAssertNotNil(event.lastActiveAt)
    }

    func testUserStatusEventDecodingWithNilLastActiveAt() throws {
        let json = """
        {
            "userId": "u2",
            "username": "bob",
            "isOnline": false,
            "lastActiveAt": null
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(UserStatusEvent.self, from: json)
        XCTAssertEqual(event.userId, "u2")
        XCTAssertEqual(event.username, "bob")
        XCTAssertFalse(event.isOnline)
        XCTAssertNil(event.lastActiveAt)
    }

    // MARK: - TranslationEvent

    func testTranslationEventDecoding() throws {
        let json = """
        {
            "messageId": "msg42",
            "translations": [
                {
                    "id": "t1",
                    "messageId": "msg42",
                    "sourceLanguage": "en",
                    "targetLanguage": "fr",
                    "translatedContent": "Bonjour le monde",
                    "translationModel": "nllb-200",
                    "confidenceScore": 0.95
                },
                {
                    "id": "t2",
                    "messageId": "msg42",
                    "sourceLanguage": "en",
                    "targetLanguage": "es",
                    "translatedContent": "Hola mundo",
                    "translationModel": "nllb-200",
                    "confidenceScore": null
                }
            ]
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(TranslationEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg42")
        XCTAssertEqual(event.translations.count, 2)

        let first = event.translations[0]
        XCTAssertEqual(first.id, "t1")
        XCTAssertEqual(first.messageId, "msg42")
        XCTAssertEqual(first.sourceLanguage, "en")
        XCTAssertEqual(first.targetLanguage, "fr")
        XCTAssertEqual(first.translatedContent, "Bonjour le monde")
        XCTAssertEqual(first.translationModel, "nllb-200")
        XCTAssertEqual(first.confidenceScore, 0.95)

        let second = event.translations[1]
        XCTAssertEqual(second.id, "t2")
        XCTAssertEqual(second.targetLanguage, "es")
        XCTAssertEqual(second.translatedContent, "Hola mundo")
        XCTAssertNil(second.confidenceScore)
    }

    // MARK: - TranscriptionReadyEvent

    func testTranscriptionReadyEventDecoding() throws {
        let json = """
        {
            "messageId": "msg10",
            "attachmentId": "att10",
            "conversationId": "conv10",
            "transcription": {
                "id": "tr1",
                "text": "Hello world",
                "language": "en",
                "confidence": 0.98,
                "durationMs": 3200,
                "segments": [
                    {
                        "text": "Hello",
                        "startTime": 0.0,
                        "endTime": 1.5
                    },
                    {
                        "text": "world",
                        "startTime": 1.6,
                        "endTime": 3.0,
                        "speakerId": "spk1",
                        "voiceSimilarityScore": 0.87
                    }
                ],
                "speakerCount": 1
            },
            "processingTimeMs": 450
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(TranscriptionReadyEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg10")
        XCTAssertEqual(event.attachmentId, "att10")
        XCTAssertEqual(event.conversationId, "conv10")
        XCTAssertEqual(event.processingTimeMs, 450)

        let t = event.transcription
        XCTAssertEqual(t.id, "tr1")
        XCTAssertEqual(t.text, "Hello world")
        XCTAssertEqual(t.language, "en")
        XCTAssertEqual(t.confidence, 0.98)
        XCTAssertEqual(t.durationMs, 3200)
        XCTAssertEqual(t.speakerCount, 1)
        XCTAssertEqual(t.segments?.count, 2)

        let seg0 = try XCTUnwrap(t.segments?[0])
        XCTAssertEqual(seg0.text, "Hello")
        XCTAssertEqual(seg0.startTime, 0.0)
        XCTAssertEqual(seg0.endTime, 1.5)
        XCTAssertNil(seg0.speakerId)
        XCTAssertNil(seg0.voiceSimilarityScore)

        let seg1 = try XCTUnwrap(t.segments?[1])
        XCTAssertEqual(seg1.text, "world")
        XCTAssertEqual(seg1.startTime, 1.6)
        XCTAssertEqual(seg1.endTime, 3.0)
        XCTAssertEqual(seg1.speakerId, "spk1")
        XCTAssertEqual(seg1.voiceSimilarityScore, 0.87)
    }

    // MARK: - TranscriptionData with startMs/endMs

    func testTranscriptionSegmentDecodingWithMilliseconds() throws {
        let json = """
        {
            "text": "Bonjour",
            "startMs": 500,
            "endMs": 1500
        }
        """.data(using: .utf8)!

        let segment = try decoder.decode(TranscriptionSegment.self, from: json)
        XCTAssertEqual(segment.text, "Bonjour")
        XCTAssertEqual(segment.startTime ?? 0, 0.5, accuracy: 0.001)
        XCTAssertEqual(segment.endTime ?? 0, 1.5, accuracy: 0.001)
    }

    // MARK: - AudioTranslationEvent

    func testAudioTranslationEventDecoding() throws {
        let json = """
        {
            "messageId": "msg20",
            "attachmentId": "att20",
            "conversationId": "conv20",
            "language": "fr",
            "translatedAudio": {
                "id": "ta1",
                "targetLanguage": "fr",
                "url": "https://cdn.meeshy.me/audio/ta1.mp3",
                "transcription": "Bonjour le monde",
                "durationMs": 2800,
                "format": "mp3",
                "cloned": true,
                "quality": 0.92,
                "ttsModel": "chatterbox-v1",
                "segments": [
                    {
                        "text": "Bonjour le monde",
                        "startTime": 0.0,
                        "endTime": 2.8
                    }
                ]
            },
            "processingTimeMs": 1200
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(AudioTranslationEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg20")
        XCTAssertEqual(event.attachmentId, "att20")
        XCTAssertEqual(event.conversationId, "conv20")
        XCTAssertEqual(event.language, "fr")
        XCTAssertEqual(event.processingTimeMs, 1200)

        let audio = event.translatedAudio
        XCTAssertEqual(audio.id, "ta1")
        XCTAssertEqual(audio.targetLanguage, "fr")
        XCTAssertEqual(audio.url, "https://cdn.meeshy.me/audio/ta1.mp3")
        XCTAssertEqual(audio.transcription, "Bonjour le monde")
        XCTAssertEqual(audio.durationMs, 2800)
        XCTAssertEqual(audio.format, "mp3")
        XCTAssertTrue(audio.cloned)
        XCTAssertEqual(audio.quality, 0.92)
        XCTAssertEqual(audio.ttsModel, "chatterbox-v1")
        XCTAssertEqual(audio.segments?.count, 1)

        let seg = try XCTUnwrap(audio.segments?[0])
        XCTAssertEqual(seg.text, "Bonjour le monde")
        XCTAssertEqual(seg.startTime, 0.0)
        XCTAssertEqual(seg.endTime, 2.8)
    }

    func testAudioTranslationEventDecodingWithNilSegments() throws {
        let json = """
        {
            "messageId": "msg21",
            "attachmentId": "att21",
            "conversationId": "conv21",
            "language": "es",
            "translatedAudio": {
                "id": "ta2",
                "targetLanguage": "es",
                "url": "https://cdn.meeshy.me/audio/ta2.mp3",
                "transcription": "Hola",
                "durationMs": 500,
                "format": "mp3",
                "cloned": false,
                "quality": 0.85,
                "ttsModel": "chatterbox-v1"
            },
            "processingTimeMs": null
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(AudioTranslationEvent.self, from: json)
        XCTAssertEqual(event.messageId, "msg21")
        XCTAssertNil(event.processingTimeMs)
        XCTAssertFalse(event.translatedAudio.cloned)
        XCTAssertNil(event.translatedAudio.segments)
    }

    // MARK: - ReadStatusUpdateEvent

    func testReadStatusUpdateEventDecoding() throws {
        let json = """
        {
            "conversationId": "c1",
            "participantId": "p1",
            "userId": "u1",
            "type": "read",
            "updatedAt": "2026-03-06T14:30:00.000Z",
            "summary": {
                "totalMembers": 3,
                "deliveredCount": 2,
                "readCount": 1
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(ReadStatusUpdateEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "c1")
        XCTAssertEqual(event.participantId, "p1")
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.type, "read")
        XCTAssertNotNil(event.updatedAt)
        XCTAssertEqual(event.summary.totalMembers, 3)
        XCTAssertEqual(event.summary.deliveredCount, 2)
        XCTAssertEqual(event.summary.readCount, 1)
    }

    // MARK: - MessageConsumedEvent

    func testMessageConsumedEventDecoding() throws {
        let json = """
        {
            "messageId": "m1",
            "conversationId": "c1",
            "userId": "u1",
            "viewOnceCount": 1,
            "maxViewOnceCount": 3,
            "isFullyConsumed": false
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(MessageConsumedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "m1")
        XCTAssertEqual(event.conversationId, "c1")
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.viewOnceCount, 1)
        XCTAssertEqual(event.maxViewOnceCount, 3)
        XCTAssertFalse(event.isFullyConsumed)
    }

    func testMessageConsumedEventFullyConsumed() throws {
        let json = """
        {
            "messageId": "m2",
            "conversationId": "c2",
            "userId": "u2",
            "viewOnceCount": 3,
            "maxViewOnceCount": 3,
            "isFullyConsumed": true
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(MessageConsumedEvent.self, from: json)
        XCTAssertTrue(event.isFullyConsumed)
        XCTAssertEqual(event.viewOnceCount, event.maxViewOnceCount)
    }

    // MARK: - LocationSharedEvent

    func testLocationSharedEventDecoding() throws {
        let json = """
        {
            "messageId": "loc1",
            "conversationId": "c1",
            "userId": "u1",
            "latitude": 48.8566,
            "longitude": 2.3522,
            "altitude": 35.0,
            "accuracy": 10.5,
            "placeName": "Tour Eiffel",
            "address": "Champ de Mars, 5 Av. Anatole France, 75007 Paris",
            "timestamp": "2026-03-06T15:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(LocationSharedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "loc1")
        XCTAssertEqual(event.conversationId, "c1")
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.latitude, 48.8566, accuracy: 0.0001)
        XCTAssertEqual(event.longitude, 2.3522, accuracy: 0.0001)
        XCTAssertEqual(event.altitude, 35.0)
        XCTAssertEqual(event.accuracy, 10.5)
        XCTAssertEqual(event.placeName, "Tour Eiffel")
        XCTAssertEqual(event.address, "Champ de Mars, 5 Av. Anatole France, 75007 Paris")
        XCTAssertNotNil(event.timestamp)
    }

    func testLocationSharedEventDecodingWithNilOptionals() throws {
        let json = """
        {
            "messageId": "loc2",
            "conversationId": "c2",
            "userId": "u2",
            "latitude": 40.7128,
            "longitude": -74.0060
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(LocationSharedEvent.self, from: json)
        XCTAssertEqual(event.messageId, "loc2")
        XCTAssertNil(event.altitude)
        XCTAssertNil(event.accuracy)
        XCTAssertNil(event.placeName)
        XCTAssertNil(event.address)
        XCTAssertNil(event.timestamp)
    }

    // MARK: - LiveLocationStartedEvent

    func testLiveLocationStartedEventDecoding() throws {
        let json = """
        {
            "conversationId": "c1",
            "userId": "u1",
            "username": "alice",
            "latitude": 48.8566,
            "longitude": 2.3522,
            "durationMinutes": 30,
            "expiresAt": "2026-03-06T15:30:00.000Z",
            "startedAt": "2026-03-06T15:00:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(LiveLocationStartedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "c1")
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.username, "alice")
        XCTAssertEqual(event.latitude, 48.8566, accuracy: 0.0001)
        XCTAssertEqual(event.longitude, 2.3522, accuracy: 0.0001)
        XCTAssertEqual(event.durationMinutes, 30)
        XCTAssertNotNil(event.expiresAt)
        XCTAssertNotNil(event.startedAt)
    }

    // MARK: - LiveLocationUpdatedEvent

    func testLiveLocationUpdatedEventDecoding() throws {
        let json = """
        {
            "conversationId": "c1",
            "userId": "u1",
            "latitude": 48.8570,
            "longitude": 2.3525,
            "altitude": 40.0,
            "accuracy": 5.0,
            "speed": 1.2,
            "heading": 90.0,
            "timestamp": "2026-03-06T15:05:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(LiveLocationUpdatedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "c1")
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.latitude, 48.8570, accuracy: 0.0001)
        XCTAssertEqual(event.longitude, 2.3525, accuracy: 0.0001)
        XCTAssertEqual(event.altitude, 40.0)
        XCTAssertEqual(event.accuracy, 5.0)
        XCTAssertEqual(event.speed, 1.2)
        XCTAssertEqual(event.heading, 90.0)
        XCTAssertNotNil(event.timestamp)
    }

    func testLiveLocationUpdatedEventDecodingWithNilOptionals() throws {
        let json = """
        {
            "conversationId": "c2",
            "userId": "u2",
            "latitude": 40.0,
            "longitude": -74.0
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(LiveLocationUpdatedEvent.self, from: json)
        XCTAssertNil(event.altitude)
        XCTAssertNil(event.accuracy)
        XCTAssertNil(event.speed)
        XCTAssertNil(event.heading)
        XCTAssertNil(event.timestamp)
    }

    // MARK: - LiveLocationStoppedEvent

    func testLiveLocationStoppedEventDecoding() throws {
        let json = """
        {
            "conversationId": "c1",
            "userId": "u1",
            "stoppedAt": "2026-03-06T15:20:00.000Z"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(LiveLocationStoppedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "c1")
        XCTAssertEqual(event.userId, "u1")
        XCTAssertNotNil(event.stoppedAt)
    }

    func testLiveLocationStoppedEventDecodingWithNilStoppedAt() throws {
        let json = """
        {"conversationId": "c2", "userId": "u2"}
        """.data(using: .utf8)!

        let event = try decoder.decode(LiveLocationStoppedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "c2")
        XCTAssertEqual(event.userId, "u2")
        XCTAssertNil(event.stoppedAt)
    }

    // MARK: - SocketNotificationEvent

    func testSocketNotificationEventDecodingAllFields() throws {
        // Gateway now serialises sender/context/metadata as nested objects.
        // The flat senderUsername/conversationId/etc. accessors on the Swift
        // side are computed properties that resolve from the nested structs.
        let json = """
        {
            "id": "notif1",
            "userId": "u1",
            "type": "new_message",
            "title": "Nouveau message",
            "content": "Salut !",
            "priority": "high",
            "isRead": false,
            "actor": {
                "username": "alice",
                "displayName": "Alice Dupont",
                "avatar": "https://cdn.meeshy.me/avatars/alice.jpg"
            },
            "context": {
                "conversationId": "conv1",
                "messageId": "msg1"
            },
            "metadata": {
                "commentPreview": "Salut ! Comment ca va ?"
            }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(SocketNotificationEvent.self, from: json)
        XCTAssertEqual(event.id, "notif1")
        XCTAssertEqual(event.userId, "u1")
        XCTAssertEqual(event.type, "new_message")
        XCTAssertEqual(event.title, "Nouveau message")
        XCTAssertEqual(event.content, "Salut !")
        XCTAssertEqual(event.priority, "high")
        XCTAssertEqual(event.isRead, false)
        XCTAssertEqual(event.senderUsername, "alice")
        XCTAssertEqual(event.senderDisplayName, "Alice Dupont")
        XCTAssertEqual(event.senderAvatar, "https://cdn.meeshy.me/avatars/alice.jpg")
        XCTAssertEqual(event.messagePreview, "Salut ! Comment ca va ?")
        XCTAssertEqual(event.conversationId, "conv1")
        XCTAssertEqual(event.messageId, "msg1")
        XCTAssertEqual(event.notificationType, .newMessage)
    }

    func testSocketNotificationEventDecodingWithNilOptionals() throws {
        let json = """
        {
            "id": "notif2",
            "userId": "u2",
            "type": "system",
            "title": "Maintenance",
            "content": "Server maintenance at midnight"
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(SocketNotificationEvent.self, from: json)
        XCTAssertEqual(event.id, "notif2")
        XCTAssertEqual(event.type, "system")
        XCTAssertNil(event.priority)
        XCTAssertNil(event.isRead)
        XCTAssertNil(event.senderUsername)
        XCTAssertNil(event.senderDisplayName)
        XCTAssertNil(event.senderAvatar)
        XCTAssertNil(event.messagePreview)
        XCTAssertNil(event.conversationId)
        XCTAssertNil(event.messageId)
        XCTAssertEqual(event.notificationType, .system)
    }

    // MARK: - AttachmentUpdatedEvent (message:attachment-updated)

    /// Regression test for the Prisme Linguistique fault-isolation guard
    /// in `APIMessageAttachment.init(from:)`. Before this guard, a single
    /// malformed `translations` entry (e.g., a language partially written
    /// by an in-flight translator worker) caused the entire attachment
    /// decode to throw — and `MessageSocketManager.decode(_:from:)`
    /// silently swallowed the event. The attachment must now decode even
    /// when the translations map contains a junk entry.
    func testAttachmentUpdated_recoversFromMalformedTranslationEntry() throws {
        let json = """
        {
          "conversationId": "conv-1",
          "messageId": "msg-1",
          "attachment": {
            "id": "att-1",
            "messageId": "msg-1",
            "type": "audio",
            "fileUrl": "https://cdn/voice.m4a",
            "originalName": "voice.m4a",
            "mimeType": "audio/m4a",
            "fileSize": 870400,
            "duration": 42000,
            "transcription": { "text": "Bonjour", "language": "fr" },
            "translations": {
              "en": { "url": "https://cdn/en.mp3", "transcription": "Hello", "format": "mp3" },
              "de": "not-an-object-just-a-broken-string"
            },
            "createdAt": "2026-05-25T10:00:00Z"
          }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(AttachmentUpdatedEvent.self, from: json)
        // The attachment surfaces despite the malformed `de` entry.
        XCTAssertEqual(event.attachment.id, "att-1")
        XCTAssertEqual(event.attachment.transcription?.text, "Bonjour")
        // The translations dictionary itself decoded to nil (the whole map
        // was malformed because of the broken `de` value), but critically
        // the rest of the attachment is preserved instead of the whole
        // event being silently swallowed.
        XCTAssertEqual(event.attachment.fileSize, 870400)
    }

    func testAttachmentUpdatedEventDecoding() throws {
        let json = """
        {
          "conversationId": "conv-1",
          "messageId": "msg-1",
          "attachment": {
            "id": "att-1",
            "messageId": "msg-1",
            "type": "audio",
            "fileUrl": "https://cdn/voice.m4a",
            "originalName": "voice.m4a",
            "mimeType": "audio/m4a",
            "fileSize": 870400,
            "duration": 42000,
            "transcription": { "text": "Bonjour", "language": "fr", "confidence": 0.95 },
            "translations": {
              "en": { "url": "https://cdn/en.mp3", "transcription": "Hello", "format": "mp3" }
            },
            "createdAt": "2026-05-25T10:00:00Z"
          }
        }
        """.data(using: .utf8)!

        let event = try decoder.decode(AttachmentUpdatedEvent.self, from: json)
        XCTAssertEqual(event.conversationId, "conv-1")
        XCTAssertEqual(event.messageId, "msg-1")
        XCTAssertEqual(event.attachment.id, "att-1")
        XCTAssertEqual(event.attachment.transcription?.text, "Bonjour")
        XCTAssertEqual(event.attachment.translations?["en"]?.url, "https://cdn/en.mp3")
    }

    // MARK: - ConnectionState

    func testConnectionStateEquality() {
        XCTAssertEqual(ConnectionState.connected, ConnectionState.connected)
        XCTAssertEqual(ConnectionState.connecting, ConnectionState.connecting)
        XCTAssertEqual(ConnectionState.disconnected, ConnectionState.disconnected)
        XCTAssertEqual(ConnectionState.reconnecting(attempt: 3), ConnectionState.reconnecting(attempt: 3))

        XCTAssertNotEqual(ConnectionState.connected, ConnectionState.disconnected)
        XCTAssertNotEqual(ConnectionState.reconnecting(attempt: 1), ConnectionState.reconnecting(attempt: 2))
        XCTAssertNotEqual(ConnectionState.connecting, ConnectionState.reconnecting(attempt: 0))
    }
}
