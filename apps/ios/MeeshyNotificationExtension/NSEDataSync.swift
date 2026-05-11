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

    private static func readAuthToken() -> String? {
        // Read active user ID from shared UserDefaults
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let userId = defaults.string(forKey: "meeshy_active_user_id") else {
            // Fallback: try reading from standard UserDefaults shared key
            return nil
        }

        // Read token from Keychain (shared access group)
        let key = "meeshy_token_\(userId)"
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "me.meeshy.app",
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else {
            return nil
        }
        return token
    }
}
