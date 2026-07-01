import PushKit
import CallKit
import Combine
import MeeshySDK
import os

nonisolated private let logger = Logger(subsystem: "me.meeshy.app", category: "voip-push")
nonisolated private let perfLogger = Logger(subsystem: "me.meeshy.app", category: "calls")

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
    ///
    /// A4 — switched from `[String]` to `VoIPDedupRing` (timestamped) so a
    /// jittery network burst of 13+ retries within the dedup TTL no longer
    /// evicts genuine entries and resurfaces phantom cards.
    fileprivate var dedupRing = VoIPDedupRing()

    /// Evicts `callId` from the dedup ring. Called by `CallManager` when a
    /// reported incoming call is torn down because CallKit genuinely refused
    /// the `reportNewIncomingCall` transaction — without this, a legitimate
    /// APNs retry for the same call within the dedup TTL would be silently
    /// phantom-acked instead of re-ringing the callee.
    func clearDedup(callId: String) {
        dedupRing.remove(callId)
    }

    /// Audit P2-CC-1 — pending token to register once the user is logged in.
    /// Without this, a VoIP token delivered before login completes was
    /// silently dropped (`authToken == nil` short-circuit in
    /// `registerTokenWithBackend`) and the device received no VoIP pushes
    /// until the next cold start.
    private var pendingTokenToRegister: String?
    private var authCancellable: AnyCancellable?

    /// Audit 2026-05-21 — VoIP tokens are credentials; they no longer live in
    /// UserDefaults. ``KeychainVoIPTokenStore`` writes them to the Keychain
    /// with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` so the NSE can
    /// still read them in background. Inject for tests; the production shared
    /// instance always uses the keychain-backed default.
    private let tokenStore: VoIPTokenStoring

    /// Cached snapshot of the last registered record so the cooldown check
    /// stays synchronous — the keychain read is performed asynchronously in
    /// `setUp()` and on `forceReregister()`.
    private var lastRegisteredRecord: VoIPTokenRecord?

    override convenience init() {
        self.init(tokenStore: KeychainVoIPTokenStore())
    }

    init(tokenStore: VoIPTokenStoring) {
        self.tokenStore = tokenStore
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
        Task { [weak self] in
            // One-shot migration UserDefaults → Keychain (idempotent), then
            // prime the in-memory cooldown snapshot so the first PushKit
            // callback doesn't have to await a keychain read.
            guard let self else { return }
            _ = await self.tokenStore.migrateFromUserDefaultsIfNeeded()
            self.lastRegisteredRecord = await self.tokenStore.read()
        }
    }

    func register() {
        // P0-1 — VoIP push is iOS-only: Apple does not deliver PushKit pushes to
        // iOS-app-on-Mac ("Designed for iPad"), and PKPushRegistry on Mac causes
        // silent failures + unexpected CallKit errors. Gate the full registration.
        guard !ProcessInfo.processInfo.isiOSAppOnMac else {
            logger.info("VoIP push registration skipped (iOS-app-on-Mac)")
            return
        }
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
        // Phase A real-time instrumentation — log the VoIP push arrival
        // BEFORE any validation so we capture even malformed/phantom pushes
        // (the ones that hide bugs in CallKit reporting). Correlate with the
        // gateway-side `perf:push.sendViaAPNS` for VoIP topics.
        let voipReceivedAt = Date()
        let dbgCallId = (data["callId"] as? String) ?? "nil"
        let dbgType = (data["type"] as? String) ?? "nil"
        perfLogger.info("perf:ios.notif.voip-push receivedAt=\(voipReceivedAt.timeIntervalSince1970, privacy: .public) callId=\(dbgCallId, privacy: .public) type=\(dbgType, privacy: .public) payloadKeys=\(data.keys.count, privacy: .public)")

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
        //
        // The contains-check and insert are performed in a single MainActor
        // block to prevent a check-then-act race if PushKit ever delivers two
        // pushes concurrently on different threads.
        let alreadyReported = MainActor.assumeIsolated {
            let seen = Self.shared.dedupRing.contains(callId, now: Date())
            if !seen { Self.shared.dedupRing.insert(callId, now: Date()) }
            return seen
        }
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
    // Audit P1-15 — `internal` (was `private`) so the unit test bundle can
    // exercise the JSON parsing logic directly without spinning up PushKit.
    nonisolated static func parseIceServers(_ rawJSON: Any?) -> [IceServer]? {
        guard let str = rawJSON as? String, !str.isEmpty,
              let data = str.data(using: .utf8) else { return nil }
        guard let decoded = try? JSONDecoder().decode([SocketIceServer].self, from: data) else {
            return nil
        }
        // Credential length guard: TURN credentials from a malformed or hostile
        // payload could be arbitrarily long, causing memory pressure or overflow
        // in libwebrtc's auth header construction. Drop any server that exceeds
        // a generous-but-finite bound (1 KB per field). See QualityThresholds.turnCredentialMaxLength.
        return decoded.compactMap { server in
            guard (server.username?.count ?? 0) <= QualityThresholds.turnCredentialMaxLength,
                  (server.credential?.count ?? 0) <= QualityThresholds.turnCredentialMaxLength else {
                logger.error("[VOIP] TURN credential too long — dropping ICE server")
                return nil
            }
            return IceServer(urls: server.urls.asArray, username: server.username, credential: server.credential)
        }
    }

    // MARK: - Caller Name Resolution

    /// Resolve caller name synchronously from payload fields.
    /// Priority: callerName > callerUsername > localized fallback
    /// Audit P1-15 — `internal` (was `private`) for unit-test access.
    nonisolated static func resolveCallerName(callerName: String?, callerUsername: String?) -> String {
        if let name = callerName, !name.isEmpty {
            return name
        }
        if let username = callerUsername, !username.isEmpty {
            return username
        }
        return String(localized: "call.incoming.unknown_caller", defaultValue: "Appel entrant", bundle: .main)
    }

    /// Resolve caller name asynchronously from the persisted conversations cache.
    /// Returns the participant's username from a direct conversation matching the caller's user ID.
    nonisolated private static func resolveCallerNameFromCache(callerUserId: String) async -> String? {
        guard !callerUserId.isEmpty else { return nil }
        // CallKit display path: we need whatever name the user already has
        // cached for the conversation (snapshot semantics — kicking a
        // revalidate during an incoming call would only fight with the
        // CallKit deadline).
        let cache = CacheCoordinator.shared
        let result = await cache.conversations.load(for: "list")
        guard let conversations = result.snapshot() else { return nil }
        let match = conversations.first { $0.participantUserId == callerUserId }
        return match?.participantUsername ?? match?.title
    }

    nonisolated func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        logger.info("VoIP token invalidated — forcing re-registration")
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.voipToken = nil
            self.forceReregister()
        }
    }

    // MARK: - Backend Registration

    static let voipRegistrationCooldown: TimeInterval = 300

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

        // Idempotence: same VoIP token within the cooldown window is a
        // no-op. PushKit re-emits the same token on every `register()` call
        // (`forceReregister` etc.) — without this guard each cycle produced
        // a redundant POST.
        // `??` is an `@autoclosure`-based operator; Swift 6 rejects `await`
        // inside the rhs autoclosure ("'async' call in an autoclosure that
        // does not support concurrency"), so resolve the fallback in an
        // explicit branch.
        let now = Date()
        let last: VoIPTokenRecord?
        if let cached = lastRegisteredRecord {
            last = cached
        } else {
            last = await tokenStore.read()
        }
        if let last,
           last.token == token,
           now.timeIntervalSince(last.at) < Self.voipRegistrationCooldown {
            pendingTokenToRegister = nil
            lastRegisteredRecord = last
            logger.debug("Skipping VoIP token registration: same token registered \(Int(now.timeIntervalSince(last.at)))s ago")
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
            let record = VoIPTokenRecord(token: token, at: now)
            do {
                try await tokenStore.save(token: token, at: now)
            } catch {
                // Keychain write failure is not fatal — the token is already
                // registered server-side and the in-memory cooldown snapshot
                // (`lastRegisteredRecord`) prevents a duplicate next-cycle POST.
                // Log at error level so Crashlytics captures the OSStatus.
                logger.error("VoIP token keychain save failed (non-fatal): \(error.localizedDescription, privacy: .public)")
            }
            lastRegisteredRecord = record
            pendingTokenToRegister = nil
            logger.info("VoIP token registered with backend (env=\(PushNotificationManager.apnsEnvironment))")
        } catch {
            logger.error("Failed to register VoIP token: \(error.localizedDescription)")
        }
    }
}

// MARK: - Test seams

#if DEBUG
extension VoIPPushManager {
    /// Test-only accessor on the in-memory cooldown snapshot so the
    /// `*Tests` bundle can assert behaviour without poking UserDefaults.
    var debug_lastRegisteredRecord: VoIPTokenRecord? { lastRegisteredRecord }

    /// Test-only mutator used by `VoIPPushManagerTests` to prime the
    /// cooldown without touching the keychain.
    func debug_setLastRegisteredRecord(_ record: VoIPTokenRecord?) {
        lastRegisteredRecord = record
    }
}
#endif
