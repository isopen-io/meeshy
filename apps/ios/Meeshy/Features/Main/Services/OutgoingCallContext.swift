import MeeshySDK

nonisolated struct OutgoingCallContext: Equatable, Sendable {
    let conversationId: String
    let userId: String
    let displayName: String
    let kind: CallKind
}
