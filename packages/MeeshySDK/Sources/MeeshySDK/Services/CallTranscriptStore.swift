import Foundation
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "calls")

/// Local-only actor for call transcripts — never a network call, mirrors
/// `ConversationDraftManager`'s shape. `saveMerging` merges with any existing
/// transcript for the same `callId` (rather than overwriting) so a
/// crash+rejoin's two separate `resetForCallEnd()` calls don't drop the
/// pre-rejoin segments. See
/// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md §2/§3.
public actor CallTranscriptStore {
    public static let shared = CallTranscriptStore()

    private let cache: CacheCoordinator

    init(cache: CacheCoordinator = .shared) {
        self.cache = cache
    }

    public func saveMerging(_ transcript: CallTranscript) async {
        let merged: CallTranscript
        if let existing = await self.transcript(for: transcript.callId) {
            let byIdentity = Dictionary(grouping: existing.segments + transcript.segments) {
                "\($0.speakerId)|\($0.capturedAt.timeIntervalSince1970)|\($0.text)"
            }
            merged = CallTranscript(
                callId: transcript.callId,
                conversationId: transcript.conversationId,
                callStartedAt: existing.callStartedAt,
                segments: byIdentity.values.compactMap(\.first).sorted { $0.capturedAt < $1.capturedAt }
            )
        } else {
            merged = transcript
        }
        do {
            try await cache.callTranscripts.save([merged], for: merged.callId)
        } catch {
            logger.error("CallTranscriptStore.saveMerging failed: \(error.localizedDescription)")
        }
    }

    public func transcript(for callId: String) async -> CallTranscript? {
        switch await cache.callTranscripts.load(for: callId) {
        case .fresh(let items, _), .stale(let items, _):
            return items.first
        case .expired, .empty:
            return nil
        }
    }

    public func invalidate(for callId: String) async {
        await cache.callTranscripts.invalidate(for: callId)
    }
}
