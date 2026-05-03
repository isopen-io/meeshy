import PushKit
import CallKit
import MeeshySDK
import os

nonisolated private let logger = Logger(subsystem: "me.meeshy.app", category: "voip-push")

@MainActor
final class VoIPPushManager: NSObject, ObservableObject {
    static let shared = VoIPPushManager()

    private var voipRegistry: PKPushRegistry?
    @Published private(set) var voipToken: String?

    override private init() {
        super.init()
    }

    func register() {
        guard voipRegistry == nil else { return }
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        voipRegistry = registry
        logger.info("VoIP push registration started")
    }

    func unregister() {
        voipRegistry?.desiredPushTypes = []
        voipRegistry = nil
        voipToken = nil
        logger.info("VoIP push unregistered")
    }
}

// MARK: - PKPushRegistryDelegate

extension VoIPPushManager: PKPushRegistryDelegate {

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }

        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        logger.info("VoIP token received: \(token.prefix(8))...")

        Task { @MainActor [weak self] in
            self?.voipToken = token
            await self?.registerTokenWithBackend(token)
        }
    }

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else {
            completion()
            return
        }

        let data = payload.dictionaryPayload
        let callId = data["callId"] as? String ?? UUID().uuidString
        let callerUserId = data["callerUserId"] as? String ?? ""
        let isVideo = data["isVideo"] as? Bool ?? false

        // Resolve caller display name from payload fields (synchronous)
        let payloadName = data["callerName"] as? String
        let payloadUsername = data["callerUsername"] as? String
        let resolvedName = Self.resolveCallerName(
            callerName: payloadName,
            callerUsername: payloadUsername
        )

        // Format with call type suffix for CallKit display
        let callTypeLabel = isVideo ? "Meeshy Vidéo" : "Meeshy Audio"
        let displayName = "\(resolvedName) (\(callTypeLabel))"

        logger.info("VoIP push received: callId=\(callId), caller=\(displayName)")

        // PushKit delivers this on .main (configured in register()). We are
        // guaranteed to be on the main thread but the function is nonisolated,
        // so we use MainActor.assumeIsolated to bridge into @MainActor context
        // synchronously — no dispatch_sync, no deadlock.
        MainActor.assumeIsolated {
            CallManager.shared.reportIncomingVoIPCall(
                callId: callId,
                callerUserId: callerUserId,
                callerName: displayName,
                isVideo: isVideo
            )
        }

        // Async: attempt to resolve a better name from the conversations cache
        // and update CallKit if the payload was missing the caller name.
        if payloadName == nil || payloadName?.isEmpty == true {
            Task { @MainActor in
                let cachedName = await Self.resolveCallerNameFromCache(callerUserId: callerUserId)
                guard let cachedName, !cachedName.isEmpty else { return }
                let updatedDisplay = "\(cachedName) (\(callTypeLabel))"
                CallManager.shared.updateIncomingCallName(updatedDisplay)
            }
        }

        completion()
    }

    // MARK: - Caller Name Resolution

    /// Resolve caller name synchronously from payload fields.
    /// Priority: callerName > callerUsername > "Appel entrant"
    nonisolated private static func resolveCallerName(callerName: String?, callerUsername: String?) -> String {
        if let name = callerName, !name.isEmpty {
            return name
        }
        if let username = callerUsername, !username.isEmpty {
            return username
        }
        return "Appel entrant"
    }

    /// Resolve caller name asynchronously from the persisted conversations cache.
    /// Returns the participant's username from a direct conversation matching the caller's user ID.
    nonisolated private static func resolveCallerNameFromCache(callerUserId: String) async -> String? {
        guard !callerUserId.isEmpty else { return nil }
        let cache = CacheCoordinator.shared
        let result = await cache.conversations.load(for: "list")
        guard let conversations = result.value else { return nil }
        let match = conversations.first { $0.participantUserId == callerUserId }
        return match?.participantUsername ?? match?.title
    }

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        logger.info("VoIP token invalidated")
        Task { @MainActor [weak self] in
            self?.voipToken = nil
        }
    }

    // MARK: - Backend Registration

    private func registerTokenWithBackend(_ token: String) async {
        guard APIClient.shared.authToken != nil else { return }

        struct RegisterTokenRequest: Encodable {
            let token: String
            let platform: String
            let type: String
        }

        do {
            let body = RegisterTokenRequest(token: token, platform: "ios", type: "voip")
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.post(
                endpoint: "/users/register-device-token",
                body: body
            )
            logger.info("VoIP token registered with backend")
        } catch {
            logger.error("Failed to register VoIP token: \(error.localizedDescription)")
        }
    }
}
