import MeeshySDK

nonisolated struct IncomingCall: Equatable, Sendable {
    let callId: String
    let fromUserId: String
    let fromUsername: String
    let kind: CallKind
    let iceServers: [IceServer]?
    let conversationId: String?
}
