import PushKit
import CallKit
import Combine
import MeeshySDK
import os

nonisolated private let logger = Logger(subsystem: "me.meeshy.app", category: "voip-push")

@MainActor
final class VoIPPushManager: NSObject, ObservableObject {
    static let shared = VoIPPushManager()

    private var voipRegistry: PKPushRegistry?
    @Published private(set) var voipToken: String?

    /// Audit P2-CC-4 — bounded ring of recently-reported callIds to dedup
    /// duplicate VoIP push deliveries. PushKit can retry a push if APNs
    /// times out before our ack; two deliveries with the same callId would
    /// produce two `reportNewIncomingCall` with different UUIDs and CallKit
    /// would render two incoming-call cards for the same call.
    private var recentlyReportedCallIds: [String] = []
    private static let dedupRingSize = 12

    /// Audit P2-CC-1 — pending token to register once the user is logged in.
    /// Without this, a VoIP token delivered before login completes was
    /// silently dropped (`authToken == nil` short-circuit in
    /// `registerTokenWithBackend`) and the device received no VoIP pushes
    /// until the next cold start.
    private var pendingTokenToRegister: String?
    private var authCancellable: AnyCancellable?

    override private init() {
        super.init()
        // Audit P2-CC-1 — observe AuthManager.isAuthenticated transitions
        // false→true so a VoIP token that arrived pre-login can be retried.
        authCancellable = AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .filter { $0 }
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    guard let self, let token = self.pendingTokenToRegister else { return }
                    await self.registerTokenWithBackend(token)
                }
            }
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

    /// Forces a fresh PushKit registration cycle, which delivers a new token
    /// via `pushRegistry(_:didUpdate:for:)`. Use this after a token has been
    /// invalidated (e.g., the leaked-push bug burned tokens, or the gateway
    /// has marked the device row inactive). The gateway upserts by
    /// (userId, token, type) so a new register call reactivates a deactivated
    /// row server-side.
    func forceReregister() {
        unregister()
        register()
        logger.info("VoIP push force re-registration triggered")
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

        // Defense-in-depth: validate the payload BEFORE waking the call UI.
        // PushKit requires that we report a call for every received push;
        // failure to do so causes the system to kill the app and revoke the
        // VoIP token. So when the payload is malformed (stale push from the
        // leaked-push window, or unrelated data push misrouted here), report
        // a phantom call and immediately end it.
        let payloadType = data["type"] as? String
        let hasCallId = (data["callId"] as? String).map { !$0.isEmpty } ?? false
        let isCallPayload = (payloadType == "call" || payloadType == "voip_call") && hasCallId

        guard isCallPayload else {
            let phantomUUID = UUID()
            let update = CXCallUpdate()
            update.localizedCallerName = ""
            update.hasVideo = false
            MainActor.assumeIsolated {
                CallManager.shared.reportPhantomVoIPCall(uuid: phantomUUID, update: update)
            }
            logger.error("VoIP push without valid call payload — reporting phantom call (type=\(payloadType ?? "nil"))")
            completion()
            return
        }

        let callId = (data["callId"] as? String) ?? UUID().uuidString

        // Audit P2-CC-4 — if we already reported this callId recently,
        // treat the duplicate push as a no-op (just ack PushKit). We still
        // need a phantom-call report to keep PushKit happy when the dedup
        // ring already covers the callId, because PushKit demands a call
        // report per delivery. Use a phantom that ends immediately.
        let alreadyReported = MainActor.assumeIsolated { Self.shared.recentlyReportedCallIds.contains(callId) }
        if alreadyReported {
            logger.info("VoIP push duplicate detected (callId=\(callId)) — phantom-acking")
            let phantomUUID = UUID()
            let update = CXCallUpdate()
            update.localizedCallerName = ""
            update.hasVideo = false
            MainActor.assumeIsolated {
                CallManager.shared.reportPhantomVoIPCall(uuid: phantomUUID, update: update)
            }
            completion()
            return
        }
        MainActor.assumeIsolated {
            Self.shared.recentlyReportedCallIds.append(callId)
            if Self.shared.recentlyReportedCallIds.count > Self.dedupRingSize {
                Self.shared.recentlyReportedCallIds.removeFirst(Self.shared.recentlyReportedCallIds.count - Self.dedupRingSize)
            }
        }

        let callerUserId = data["callerUserId"] as? String ?? ""

        // Backend sends `isVideo` as a string ("true"/"false") because APNs
        // payloads are Record<string,string>, but older builds may still send
        // it as a Bool. Accept both for forward compatibility.
        let isVideo: Bool = {
            if let b = data["isVideo"] as? Bool { return b }
            if let s = data["isVideo"] as? String { return s.lowercased() == "true" }
            return false
        }()

        // Per-user TURN credentials carried in the push payload — required so
        // RTCPeerConnection is built with TURN BEFORE the SDP answer is
        // produced, otherwise NAT-symmetric peers can never connect.
        let iceServers = Self.parseIceServers(data["iceServers"])

        // Resolve caller display name from payload fields (synchronous)
        let payloadName = data["callerName"] as? String
        let payloadUsername = data["callerUsername"] as? String
        let resolvedName = Self.resolveCallerName(
            callerName: payloadName,
            callerUsername: payloadUsername
        )

        // CallKit affiche déjà le nom de l'app (Meeshy) et l'icône audio/
        // vidéo dans son UI système — y dupliquer "(Meeshy Audio)" /
        // "(Meeshy Vidéo)" alourdit la lockscreen et la Dynamic Island
        // sans rien apporter. On passe le nom du caller seul ; le type de
        // média est porté par CXCallUpdate.hasVideo (cf. CallManager).
        let displayName = resolvedName

        logger.info("VoIP push received: callId=\(callId), caller=\(displayName), isVideo=\(isVideo), iceServers=\(iceServers?.count ?? 0)")

        // PushKit delivers this on .main (configured in register()). We are
        // guaranteed to be on the main thread but the function is nonisolated,
        // so we use MainActor.assumeIsolated to bridge into @MainActor context
        // synchronously — no dispatch_sync, no deadlock.
        MainActor.assumeIsolated {
            CallManager.shared.reportIncomingVoIPCall(
                callId: callId,
                callerUserId: callerUserId,
                callerName: displayName,
                isVideo: isVideo,
                iceServers: iceServers
            )
        }

        // Async: attempt to resolve a better name from the conversations cache
        // and update CallKit if the payload was missing the caller name.
        if payloadName == nil || payloadName?.isEmpty == true {
            Task { @MainActor in
                let cachedName = await Self.resolveCallerNameFromCache(callerUserId: callerUserId)
                guard let cachedName, !cachedName.isEmpty else { return }
                CallManager.shared.updateIncomingCallName(cachedName)
            }
        }

        completion()
    }

    // MARK: - Payload Parsers

    /// Decode the JSON-encoded `iceServers` field carried by VoIP pushes.
    /// Returns nil when the field is missing, empty, or unparsable — callers
    /// fall back to default STUN servers in that case.
    nonisolated private static func parseIceServers(_ rawJSON: Any?) -> [IceServer]? {
        guard let str = rawJSON as? String, !str.isEmpty,
              let data = str.data(using: .utf8) else { return nil }
        guard let decoded = try? JSONDecoder().decode([SocketIceServer].self, from: data) else {
            return nil
        }
        return decoded.map { server in
            IceServer(urls: server.urls.asArray, username: server.username, credential: server.credential)
        }
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
        logger.info("VoIP token invalidated — forcing re-registration")
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.voipToken = nil
            // Re-arm desiredPushTypes so PushKit emits a fresh
            // didUpdatePushCredentials with a new token. Without this, the
            // user has no working VoIP token until next cold start.
            self.voipRegistry?.desiredPushTypes = []
            self.voipRegistry?.desiredPushTypes = [.voIP]
        }
    }

    // MARK: - Backend Registration

    private func registerTokenWithBackend(_ token: String) async {
        // Audit P2-CC-1 — queue the token if auth isn't ready yet, then
        // retry from `authBecameAvailable`. Previously the token was
        // silently dropped and the user received no VoIP pushes until the
        // next cold start.
        guard APIClient.shared.authToken != nil else {
            pendingTokenToRegister = token
            logger.info("VoIP token received before auth — queued for retry on login")
            return
        }

        let body = RegisterDeviceTokenRequest(
            token: token,
            platform: "ios",
            type: "voip",
            apnsEnvironment: PushNotificationManager.apnsEnvironment
        )

        do {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.post(
                endpoint: "/users/register-device-token",
                body: body
            )
            pendingTokenToRegister = nil
            logger.info("VoIP token registered with backend (env=\(PushNotificationManager.apnsEnvironment))")
        } catch {
            logger.error("Failed to register VoIP token: \(error.localizedDescription)")
        }
    }
}
