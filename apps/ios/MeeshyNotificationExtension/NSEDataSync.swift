import Foundation

/// Lightweight data sync for the Notification Service Extension.
///
/// Fetches the message referenced in the push payload from the REST API and
/// writes a compact JSON blob to the App Group container. When the main app
/// resumes, `CacheCoordinator` reads this directory and merges any pending
/// messages into the GRDB cache before the first paint.
///
/// Constraints:
/// - 30 second execution budget (iOS kills the extension after that)
/// - 24 MB memory limit
/// - No MeeshySDK import (too heavy — Socket.IO, WebRTC, GRDB)
/// - Auth token read from shared Keychain (same access group)
nonisolated enum NSEDataSync {

    private static let appGroupId = "group.me.meeshy.apps"
    private static let pendingDirName = "nse_pending_messages"
    private static let pendingPostsDirName = "nse_pending_posts"
    private static let snapshotsKey = "conversation_snapshots"

    // MARK: - Local-First conversation snapshot (App Group)

    /// Détails LOCAL-FIRST d'une conversation, résolus depuis le snapshot App
    /// Group écrit par l'app — sans requête serveur. SDK-free (miroir du contrat
    /// `ConversationSnapshotPayload`). `categoryName` ne porte QUE les catégories
    /// CRÉÉES PAR L'UTILISATEUR (l'app y met `nil` pour les catégories induites).
    struct LocalConversationDetails: Decodable {
        let customName: String?
        let favoriteEmoji: String?
        let categoryName: String?
        let isMuted: Bool
        let isLocked: Bool

        enum CodingKeys: String, CodingKey {
            case customName, favoriteEmoji, categoryName, isMuted, isLocked
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            customName = try c.decodeIfPresent(String.self, forKey: .customName)
            favoriteEmoji = try c.decodeIfPresent(String.self, forKey: .favoriteEmoji)
            categoryName = try c.decodeIfPresent(String.self, forKey: .categoryName)
            isMuted = (try c.decodeIfPresent(Bool.self, forKey: .isMuted)) ?? false
            isLocked = (try c.decodeIfPresent(Bool.self, forKey: .isLocked)) ?? false
        }
    }

    /// Détails locaux d'une conversation, lus depuis le store keyé de l'App
    /// Group. `nil` si absent (l'appelant retombe sur le titre canonique du
    /// push). Best-effort, jamais throwing.
    static func conversationDetails(forId conversationId: String) -> LocalConversationDetails? {
        guard !conversationId.isEmpty,
              let defaults = UserDefaults(suiteName: appGroupId),
              let data = defaults.data(forKey: snapshotsKey) else { return nil }
        let decoder = JSONDecoder()
        guard let map = try? decoder.decode([String: LocalConversationDetails].self, from: data) else {
            return nil
        }
        return map[conversationId]
    }

    // MARK: - Sync entry point

    /// Fetch a message from the API and persist it to the shared container.
    /// Call from `didReceive(_:withContentHandler:)` after extracting the
    /// push payload fields.
    ///
    /// IMPORTANT — security note (audit 2026-05-11):
    /// The `apiBaseURL` is resolved from the shared App Group UserDefaults
    /// (which the main app writes when its environment changes), with a
    /// strict allowlist + a hardcoded production fallback. We deliberately
    /// do NOT accept a URL from the push payload anymore — that prior
    /// design allowed an attacker who could deliver a push (compromised
    /// FCM credentials, MITM in the APNs delivery chain) to redirect this
    /// authenticated request to an attacker-controlled host and exfiltrate
    /// the user's live Bearer JWT.
    static func syncMessage(
        conversationId: String,
        messageId: String,
        completion: @escaping @Sendable (Bool) -> Void
    ) {
        guard let token = readAuthToken() else {
            completion(false)
            return
        }

        let apiBaseURL = resolveApiBaseURL()
        let urlString = "\(apiBaseURL)/api/v1/conversations/\(conversationId)/messages/\(messageId)"
        guard let url = URL(string: urlString) else {
            completion(false)
            return
        }

        var request = URLRequest(url: url, timeoutInterval: 15)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            guard let data,
                  let http = response as? HTTPURLResponse,
                  http.statusCode == 200 else {
                completion(false)
                return
            }

            // Extract the message data from the API response envelope
            // { "success": true, "data": { ...message... } }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let messageData = json["data"],
                  let messageJSON = try? JSONSerialization.data(withJSONObject: messageData) else {
                completion(false)
                return
            }

            let saved = writePendingMessage(
                conversationId: conversationId,
                messageId: messageId,
                data: messageJSON
            )
            completion(saved)
        }
        task.resume()
    }

    /// Fetch a post (with its inline comments) from the API and persist it to the
    /// shared container, so that tapping a SOCIAL notification (post_comment,
    /// comment_reply, story_new_comment, …) on cold start opens the post detail
    /// with data already local — no blank screen waiting on a network round-trip.
    /// Same trust model as `syncMessage`: token from the shared Keychain, base URL
    /// from the allowlist (never from the push payload).
    static func syncPost(
        postId: String,
        completion: @escaping @Sendable (Bool) -> Void
    ) {
        guard let token = readAuthToken() else {
            completion(false)
            return
        }

        let apiBaseURL = resolveApiBaseURL()
        let urlString = "\(apiBaseURL)/api/v1/posts/\(postId)"
        guard let url = URL(string: urlString) else {
            completion(false)
            return
        }

        var request = URLRequest(url: url, timeoutInterval: 15)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let task = URLSession.shared.dataTask(with: request) { data, response, _ in
            guard let data,
                  let http = response as? HTTPURLResponse,
                  http.statusCode == 200 else {
                completion(false)
                return
            }

            // Envelope: { "success": true, "data": { ...post... } }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let postData = json["data"],
                  let postJSON = try? JSONSerialization.data(withJSONObject: postData) else {
                completion(false)
                return
            }

            let saved = writePendingPost(postId: postId, data: postJSON)
            completion(saved)
        }
        task.resume()
    }

    // MARK: - Shared container I/O

    private static func pendingDirectory() -> URL? {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) else { return nil }

        let dir = container.appendingPathComponent(pendingDirName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private static func writePendingMessage(
        conversationId: String,
        messageId: String,
        data: Data
    ) -> Bool {
        guard let dir = pendingDirectory() else { return false }
        let filename = "\(conversationId)_\(messageId).json"
        let fileURL = dir.appendingPathComponent(filename)
        do {
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            return false
        }
    }

    /// Called by the main app on foreground resume to consume pending messages.
    /// Returns array of (conversationId, messageJSON) tuples.
    static func consumePendingMessages() -> [(conversationId: String, data: Data)] {
        guard let dir = pendingDirectory() else { return [] }

        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return []
        }

        var results: [(String, Data)] = []
        for file in files where file.pathExtension == "json" {
            let name = file.deletingPathExtension().lastPathComponent
            let parts = name.split(separator: "_", maxSplits: 1)
            guard parts.count == 2, let data = try? Data(contentsOf: file) else { continue }
            results.append((String(parts[0]), data))
            try? fm.removeItem(at: file)
        }
        return results
    }

    private static func pendingPostsDirectory() -> URL? {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) else { return nil }

        let dir = container.appendingPathComponent(pendingPostsDirName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private static func writePendingPost(postId: String, data: Data) -> Bool {
        guard let dir = pendingPostsDirectory() else { return false }
        let fileURL = dir.appendingPathComponent("\(postId).json")
        do {
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            return false
        }
    }

    /// Called by the main app (post-detail open + foreground resume) to consume
    /// posts prefetched by the NSE. Returns the raw `APIPost` JSON blobs; the
    /// caller decodes with the SDK and merges into the feed cache.
    static func consumePendingPosts() -> [Data] {
        guard let dir = pendingPostsDirectory() else { return [] }

        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return []
        }

        var results: [Data] = []
        for file in files where file.pathExtension == "json" {
            guard let data = try? Data(contentsOf: file) else { continue }
            results.append(data)
            try? fm.removeItem(at: file)
        }
        return results
    }

    // MARK: - Trusted base URL resolution
    //
    // The NSE never trusts a URL coming from the push payload (see security
    // note on syncMessage). The base URL is resolved from a small allowlist
    // matching the xcconfig environments (Production, Staging, Localhost).
    // The main app writes the active environment to App Group UserDefaults
    // (`meeshy_api_base_url`) when the user switches environment via the
    // dev menu; the NSE reads it at request time. Anything outside the
    // allowlist falls back to production.

    private static let allowedApiBaseURLs: Set<String> = [
        "https://gate.meeshy.me",
        "https://gate.staging.meeshy.me",
        "http://localhost:3000"
    ]
    private static let defaultApiBaseURL = "https://gate.meeshy.me"
    private static let apiBaseURLDefaultsKey = "meeshy_api_base_url"

    private static func resolveApiBaseURL() -> String {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let stored = defaults.string(forKey: apiBaseURLDefaultsKey),
              allowedApiBaseURLs.contains(stored) else {
            return defaultApiBaseURL
        }
        return stored
    }

    // MARK: - Auth token from shared Keychain

    /// Resolves the keychain access group at runtime by querying iOS for the
    /// access group it assigns to a discovery item. Returns
    /// `<TEAMID>.me.meeshy.app` — the shared group declared in both the main
    /// app's and the NSE's `keychain-access-groups` entitlement.
    ///
    /// We must specify `kSecAttrAccessGroup` explicitly because the NSE runs
    /// in its own process and iOS may default to the extension's own bundle
    /// access group (`<TEAMID>.me.meeshy.app.MeeshyNotificationExtension`)
    /// instead of the shared one — at which point `SecItemCopyMatching`
    /// silently returns `errSecItemNotFound`.
    private static let sharedKeychainAccessGroup: String? = {
        let discoveryQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: "_meeshy_nse_seed_discovery",
            kSecAttrService as String: "_meeshy_nse_seed_discovery",
            kSecReturnAttributes as String: true
        ]
        var result: AnyObject?
        var status = SecItemCopyMatching(discoveryQuery as CFDictionary, &result)
        if status == errSecItemNotFound {
            status = SecItemAdd(discoveryQuery as CFDictionary, &result)
        }
        guard status == errSecSuccess,
              let attributes = result as? [String: Any],
              let assignedGroup = attributes[kSecAttrAccessGroup as String] as? String,
              let teamPrefix = assignedGroup.components(separatedBy: ".").first,
              !teamPrefix.isEmpty else {
            return nil
        }
        return "\(teamPrefix).me.meeshy.app"
    }()

    private static func readAuthToken() -> String? {
        // Read active user ID from shared UserDefaults
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let userId = defaults.string(forKey: "meeshy_active_user_id") else {
            return nil
        }

        // Read token from Keychain (shared access group)
        let key = "meeshy_token_\(userId)"
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "me.meeshy.app",
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        if let group = sharedKeychainAccessGroup {
            query[kSecAttrAccessGroup as String] = group
        }

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else {
            return nil
        }
        return token
    }

    // MARK: - Background server POST (delivery receipts, …)
    //
    // Reliability-first, latency-tolerant calls from the NSE. The request is
    // handed to the system transfer daemon (`nsurlsessiond`), so it survives
    // the extension being suspended the instant it calls `contentHandler` —
    // unlike `URLSession.shared`, whose tasks die with the process. This is
    // the standard path for "fire-and-forget to the gateway" from the
    // extension; it is NOT for anything that must enrich the banner (a
    // background transfer has no latency guarantee).

    /// Minimal delegate so the background `URLSession` is valid. No completion
    /// handling: the daemon carries the request to completion on its own, and
    /// a lost receipt is acceptable (the author's checkmark simply upgrades
    /// later, when the recipient opens the app).
    private final class BackgroundSessionDelegate: NSObject, URLSessionDelegate, @unchecked Sendable {}

    /// One background `URLSession` per NSE process. The identifier carries a
    /// per-process UUID because iOS may run several NSE instances concurrently
    /// for rapid-fire pushes, and two live sessions sharing an identifier is a
    /// documented conflict. A `static let` keeps it to a single session object
    /// within this process so the daemon can coalesce its tasks.
    private static let backgroundSession: URLSession = {
        let config = URLSessionConfiguration.background(
            withIdentifier: "me.meeshy.nse.bg.\(UUID().uuidString)"
        )
        config.sharedContainerIdentifier = appGroupId
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = false
        return URLSession(
            configuration: config,
            delegate: BackgroundSessionDelegate(),
            delegateQueue: nil
        )
    }()

    /// Fire-and-forget authenticated POST to the gateway via the background
    /// session. `path` is appended to the resolved (allowlisted) API base URL.
    /// The Bearer JWT is read from the shared Keychain — same trust model as
    /// `syncMessage`, and the base URL is never taken from the push payload.
    static func enqueueBackgroundPost(path: String, body: Data) {
        guard let token = readAuthToken() else { return }

        let apiBaseURL = resolveApiBaseURL()
        guard let url = URL(string: "\(apiBaseURL)\(path)") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        // Background upload tasks must read their body from a file.
        guard let bodyFileURL = writeBackgroundBodyFile(body) else { return }

        let task = backgroundSession.uploadTask(with: request, fromFile: bodyFileURL)
        task.resume()
    }

    /// POST a delivery receipt for a message received via push while the user
    /// was offline. The gateway marks the message delivered for this recipient
    /// and broadcasts `read-status:updated`, so the author's checkmark
    /// upgrades ✓ → ✓✓ without waiting for the recipient to open the app.
    /// The gateway still enforces the recipient's `showReadReceipts` setting.
    static func postDeliveryReceipt(conversationId: String, messageId: String) {
        let cid = conversationId.addingPercentEncoding(
            withAllowedCharacters: .urlPathAllowed
        ) ?? conversationId
        let mid = messageId.addingPercentEncoding(
            withAllowedCharacters: .urlPathAllowed
        ) ?? messageId
        enqueueBackgroundPost(
            path: "/api/v1/conversations/\(cid)/messages/\(mid)/delivery-receipt",
            body: Data("{}".utf8)
        )
    }

    /// Persists the POST body to the App Group container — a background upload
    /// task reads its body from a file, and the file must outlive the
    /// extension. Old files are pruned opportunistically since the system does
    /// not delete them once the transfer completes.
    private static func writeBackgroundBodyFile(_ body: Data) -> URL? {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) else { return nil }

        let dir = container.appendingPathComponent("nse_bg_uploads", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        pruneBackgroundBodyFiles(in: dir)

        let fileURL = dir.appendingPathComponent("\(UUID().uuidString).json")
        do {
            try body.write(to: fileURL, options: [.atomic])
            return fileURL
        } catch {
            return nil
        }
    }

    /// Best-effort removal of body files older than one hour (their transfers
    /// have long since completed or failed).
    private static func pruneBackgroundBodyFiles(in dir: URL) {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: [.contentModificationDateKey]
        ) else { return }

        let cutoff = Date().addingTimeInterval(-3600)
        for file in files {
            let modified = (try? file.resourceValues(
                forKeys: [.contentModificationDateKey]
            ))?.contentModificationDate
            if let modified, modified < cutoff {
                try? fm.removeItem(at: file)
            }
        }
    }
}
