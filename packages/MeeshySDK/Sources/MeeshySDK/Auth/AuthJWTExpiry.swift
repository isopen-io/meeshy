import Foundation
import os

/// Lecture PURE de l'expiration d'un JWT (`exp`), sans jamais vérifier sa
/// signature : le serveur reste seul juge, le client sait seulement s'il doit
/// rafraîchir. Façade publique : `AuthManager.isTokenExpired(_:now:)`.
enum AuthJWTExpiry {
    /// D2 — pure decoder so tests can probe every branch without driving
    /// the singleton's Keychain/UserDefaults state. Returns `true` for
    /// every malformed input (safe default) and logs the reason so a
    /// silent-logout report can be traced.
    static func isExpired(_ token: String?, now: Date) -> Bool {
        guard let token else { return true }
        let parts = token.split(separator: ".")
        guard parts.count == 3 else {
            Logger.auth.warning("JWT structurally invalid (parts=\(parts.count)); treating as expired")
            return true
        }
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let data = Data(base64Encoded: base64) else {
            Logger.auth.warning("JWT payload base64 decode failed; treating as expired")
            return true
        }
        let json: [String: Any]
        do {
            guard let decoded = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                Logger.auth.warning("JWT payload not a JSON object; treating as expired")
                return true
            }
            json = decoded
        } catch {
            Logger.auth.warning("JWT payload JSON deserialization failed: \(error.localizedDescription, privacy: .public); treating as expired")
            return true
        }
        guard let exp = json["exp"] as? TimeInterval else {
            Logger.auth.warning("JWT payload missing `exp` claim; treating as expired")
            return true
        }
        return Date(timeIntervalSince1970: exp).addingTimeInterval(-30) < now
    }
}
