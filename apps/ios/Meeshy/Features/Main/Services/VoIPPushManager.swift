import PushKit
import CallKit
import MeeshySDK
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "voip-push")

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

extension VoIPPushManager: @preconcurrency PKPushRegistryDelegate {

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }

        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        logger.info("VoIP token received: \(token.prefix(8))...")

        Task { @MainActor in
            self.voipToken = token
            await self.registerTokenWithBackend(token)
        }
    }

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else {
            completion()
            return
        }

        let data = payload.dictionaryPayload
        let callId = data["callId"] as? String ?? UUID().uuidString
        let callerName = data["callerName"] as? String ?? "Appel entrant"
        let callerUserId = data["callerUserId"] as? String ?? ""
        let isVideo = data["isVideo"] as? Bool ?? false

        logger.info("VoIP push received: callId=\(callId), caller=\(callerName)")

        Task { @MainActor in
            CallManager.shared.reportIncomingVoIPCall(
                callId: callId,
                callerUserId: callerUserId,
                callerName: callerName,
                isVideo: isVideo
            )
            completion()
        }
    }

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        logger.info("VoIP token invalidated")
        Task { @MainActor in
            self.voipToken = nil
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
