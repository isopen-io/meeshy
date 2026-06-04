import Foundation
import MeeshySDK

/// Decides how the composer's pending attachments + text are split into
/// per-type messages on send. Pure and synchronous so the orchestration
/// decision is unit-testable independently of the View / network.
///
/// Rules (spec 2026-05-30, lot A2) :
/// - Attachments are grouped by type bucket : `.audio` vs `.visual`
///   (image|video|file). One message per non-empty group.
/// - Group order follows the first-appearance order of each bucket.
/// - Text is ALWAYS a separate message, sent LAST (never an inline caption
///   on the composer path).
/// - A reply/forward reference is carried by the FIRST planned message only.
enum MultiAttachmentSendPlanner {

    enum Kind: Equatable {
        case audio
        case visual
        case text
    }

    struct PlannedMessage {
        let kind: Kind
        let attachments: [MeeshyMessageAttachment]
        let text: String?
        let carriesReply: Bool
    }

    private static func bucket(for type: MeeshyMessageAttachment.AttachmentType) -> Kind {
        switch type {
        case .audio: return .audio
        case .image, .video, .file, .location: return .visual
        }
    }

    static func plan(
        attachments: [MeeshyMessageAttachment],
        text: String,
        hasReply: Bool
    ) -> [PlannedMessage] {
        var orderedBuckets: [Kind] = []
        var grouped: [Kind: [MeeshyMessageAttachment]] = [:]

        for att in attachments {
            let b = bucket(for: att.type)
            if grouped[b] == nil {
                orderedBuckets.append(b)
            }
            grouped[b, default: []].append(att)
        }

        var planned: [PlannedMessage] = orderedBuckets.map { b in
            PlannedMessage(kind: b, attachments: grouped[b] ?? [], text: nil, carriesReply: false)
        }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            planned.append(PlannedMessage(kind: .text, attachments: [], text: trimmed, carriesReply: false))
        }

        if hasReply, !planned.isEmpty {
            let first = planned[0]
            planned[0] = PlannedMessage(
                kind: first.kind,
                attachments: first.attachments,
                text: first.text,
                carriesReply: true
            )
        }

        return planned
    }
}
