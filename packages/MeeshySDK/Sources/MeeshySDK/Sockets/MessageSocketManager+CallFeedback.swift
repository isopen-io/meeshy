import Foundation
import SocketIO

// #8072 — la note d'après-appel, émise par `call:quality-feedback`. Dans son
// propre fichier parce que `MessageSocketManager.swift` est hors budget de
// taille. La passerelle valide la charge (`socketCallQualityFeedbackSchema`)
// et l'écrit sur la ligne `CallParticipant` de celui qui note. QUAND on la
// demande est une règle produit : elle vit côté app, jamais ici.

public enum CallFeedbackIssue: String, CaseIterable, Sendable, Identifiable {
    case audioQuality = "audio_quality"
    case videoQuality = "video_quality"
    case echo
    case dropped
    case sync
    case other

    public var id: String { rawValue }
}

public struct CallQualityFeedback: Equatable, Sendable {
    public static let ratingRange = 1...5

    public let callId: String
    public let rating: Int
    public let issues: [CallFeedbackIssue]

    public init?(callId: String, rating: Int, issues: [CallFeedbackIssue]) {
        guard !callId.isEmpty, Self.ratingRange.contains(rating) else { return nil }
        self.callId = callId
        self.rating = rating
        self.issues = issues.reduce(into: [CallFeedbackIssue]()) { kept, issue in
            if !kept.contains(issue) { kept.append(issue) }
        }
    }

    public var socketPayload: [String: Any] {
        let base: [String: Any] = ["callId": callId, "rating": rating]
        guard !issues.isEmpty else { return base }
        return base.merging(["issues": issues.map(\.rawValue)]) { current, _ in current }
    }
}

public protocol CallQualityFeedbackEmitting: AnyObject {
    func emitCallQualityFeedback(_ feedback: CallQualityFeedback)
}

extension MessageSocketManager: CallQualityFeedbackEmitting {
    public func emitCallQualityFeedback(_ feedback: CallQualityFeedback) {
        socket?.emit("call:quality-feedback", feedback.socketPayload)
    }
}
