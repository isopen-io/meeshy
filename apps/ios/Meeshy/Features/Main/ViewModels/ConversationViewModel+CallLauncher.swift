import Foundation
import MeeshySDK

/// Ce que la conversation fait d'un tap sur une bulle de résumé d'appel :
/// rappeler (1:1 seulement) ou rejoindre l'appel EN COURS. Les entrées sont
/// des valeurs et des closures : le ViewModel reste le propriétaire de l'état,
/// ce type ne lit rien d'autre que ce qu'on lui remet.
struct ConversationCallLauncher {
    let conversationId: String
    let isDirect: Bool
    let participantUserId: String?
    let isAnonymous: Bool
    let currentUserId: String
    let liveCallJoin: LiveCallJoinContext
    let activeCallService: ActiveCallServiceProviding
    let peerDisplayName: () -> String?
    let conversationName: () -> String

    /// Re-initiate ("call back") a call from a tapped call-summary notice —
    /// or JOIN it when the notice is the LIVE message (`kind: 'call-live'`,
    /// "Appel … en cours"). Mirrors the conversation header's call entry
    /// point: direct (1:1) calls only, re-using the SAME media type
    /// (audio/video) as the summarized call. The peer display name is
    /// resolved best-effort from a received message so the CallKit / in-app
    /// outgoing UI shows a name, not a raw id.
    func callBack(for summary: CallSummaryMetadata) {
        // Anonymous shared-link guests never get a calling affordance — mirrors
        // the header's `anonymousHeaderBar` swap (ConversationView) which hides
        // the call buttons entirely for this session kind. A call-summary
        // bubble further down history must honor the SAME gate, otherwise a
        // guest can trigger the OS microphone permission prompt from a bubble
        // tap before the gateway's own isAnonymous check ever runs.
        guard !isAnonymous else { return }
        if summary.isLive {
            Task { await joinOngoingCall(summary) }
            return
        }
        guard isDirect, let peerUserId = participantUserId, !peerUserId.isEmpty else { return }
        let displayName = peerDisplayName()
            ?? String(localized: "call.peer.fallback", defaultValue: "Appel", bundle: .main)
        Task { @MainActor in
            await CallManager.shared.requestPermissionsThenStartCall(
                conversationId: conversationId,
                userId: peerUserId,
                displayName: displayName,
                isVideo: summary.callType == .video
            )
        }
    }

    /// Rejoint l'appel EN COURS annoncé par la bulle vivante — la revalidation
    /// (4 branches) vit dans `LiveCallJoiner`, partagé avec la ligne de liste.
    func joinOngoingCall(_ summary: CallSummaryMetadata) async {
        // Same anonymity gate as `callBack(for:)` — this is also reachable
        // directly from `callBack` for the isLive branch, but joining is a
        // distinct code path (revalidated server round-trip) so it re-asserts
        // the guard rather than relying on the caller alone.
        guard !isAnonymous else { return }
        await LiveCallJoiner(context: liveCallJoin, activeCallService: activeCallService).join(
            LiveCallJoinRequest(
                callId: summary.callId,
                conversationId: conversationId,
                isVideo: summary.callType == .video,
                currentUserId: currentUserId,
                fallbackRemoteUserId: participantUserId,
                fallbackDisplayName: isDirect ? peerDisplayName() : conversationName(),
                isGroup: !isDirect
            )
        )
    }
}
