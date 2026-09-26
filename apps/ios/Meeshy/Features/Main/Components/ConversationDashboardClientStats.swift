import Foundation
import NaturalLanguage
import MeeshySDK

// MARK: - ConversationDashboardClientStats

/// Off-MainActor snapshot of `ConversationDashboardView`'s message-derived
/// statistics — word/media counts, per-participant activity and sentiment.
///
/// Every one of these is a PURE function of `messages`, never of
/// `chartPeriod` / `serverStats` — so the view computes this snapshot ONCE
/// per `messages` array, via `Task.detached`, instead of re-running an
/// `NLTagger` sentiment pass and five `reduce`s over every message ON THE
/// MAINACTOR on every unrelated re-render (period picker, ring animation,
/// agent analysis arriving…). Audit G014/TA-01.
nonisolated struct ConversationDashboardClientStats: Sendable {
    nonisolated struct ParticipantStat: Sendable {
        let name: String
        let messageCount: Int
        let wordCount: Int
    }

    nonisolated struct Sentiment: Sendable {
        let positive: Int
        let neutral: Int
        let negative: Int
        var total: Int { positive + neutral + negative }
    }

    let totalWords: Int
    let imageCount: Int
    let audioCount: Int
    let videoCount: Int
    let participantStats: [ParticipantStat]
    let sentiment: Sentiment

    init(messages: [Message]) {
        totalWords = Self.countWords(in: messages)
        imageCount = Self.countAttachments(in: messages, matching: .image)
        audioCount = Self.countAttachments(in: messages, matching: .audio)
        videoCount = Self.countAttachments(in: messages, matching: .video)
        participantStats = Self.computeParticipantStats(from: messages)
        sentiment = Self.computeSentiment(of: messages)
    }

    private static func countWords(in messages: [Message]) -> Int {
        messages.reduce(0) { total, msg in
            total + msg.content.split(whereSeparator: \.isWhitespace).count
        }
    }

    private static func countAttachments(in messages: [Message], matching type: MessageAttachment.AttachmentType) -> Int {
        messages.reduce(0) { total, msg in
            total + msg.attachments.filter { $0.type == type }.count
        }
    }

    private static func computeParticipantStats(from messages: [Message]) -> [ParticipantStat] {
        var byName: [String: (messages: Int, words: Int)] = [:]

        for msg in messages {
            let name = msg.senderName ?? "?"
            let words = msg.content.split(whereSeparator: \.isWhitespace).count
            let current = byName[name, default: (0, 0)]
            byName[name] = (current.messages + 1, current.words + words)
        }

        return byName
            .map { ParticipantStat(name: $0.key, messageCount: $0.value.messages, wordCount: $0.value.words) }
            .sorted { $0.messageCount > $1.messageCount }
    }

    private static func computeSentiment(of messages: [Message]) -> Sentiment {
        let tagger = NLTagger(tagSchemes: [.sentimentScore])
        var pos = 0, neu = 0, neg = 0

        let textMessages = messages.filter { !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let sampled = textMessages.count > 200
            ? Array(textMessages.suffix(200))
            : textMessages

        for msg in sampled {
            tagger.string = msg.content
            let (tag, _) = tagger.tag(at: msg.content.startIndex, unit: .paragraph, scheme: .sentimentScore)
            let score = Double(tag?.rawValue ?? "0") ?? 0

            if score > 0.15 { pos += 1 }
            else if score < -0.15 { neg += 1 }
            else { neu += 1 }
        }

        return Sentiment(positive: pos, neutral: neu, negative: neg)
    }
}
