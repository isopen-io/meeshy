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
/// - Text rides the VISUAL group as its caption (#9860) : 5 photos + a
///   caption are ONE message, like every other client sends them. Without a
///   visual group (audio only, or no attachment) the text stays its own
///   message, sent LAST — spec 2026-05-30 A2 for the voice-note case.
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

        var messageContent: String { text ?? "" }
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

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let caption: String? = trimmed.isEmpty ? nil : trimmed
        let captionRidesVisual = caption != nil && grouped[.visual] != nil

        var planned: [PlannedMessage] = orderedBuckets.map { b in
            PlannedMessage(
                kind: b,
                attachments: grouped[b] ?? [],
                text: b == .visual ? caption : nil,
                carriesReply: false
            )
        }

        if let caption, !captionRidesVisual {
            planned.append(PlannedMessage(kind: .text, attachments: [], text: caption, carriesReply: false))
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
