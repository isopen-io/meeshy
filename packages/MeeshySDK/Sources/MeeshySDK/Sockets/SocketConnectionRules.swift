import Foundation

/// Règles pures de la connexion de la socket de messages : elles ne lisent que leurs entrées.
enum SocketConnectionRules {

    static func isJWTExpired(_ token: String) -> Bool {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return true }
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        // Fail-safe : un JWT illisible est traité comme expiré (déclenche un
        // refresh) plutôt que présumé valide.
        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else { return true }
        return Date(timeIntervalSince1970: exp).addingTimeInterval(-30) < Date()
    }

    /// The conversation rooms to (re)join on connect, active-first for fastest UX.
    static func roomsToRejoin(joined: Set<String>, active: String?, open: Set<String>) -> [String] {
        var rooms: [String] = []
        if let activeId = active, joined.contains(activeId) {
            rooms.append(activeId)
        }
        // Les autres fenêtres ensuite — ordre stable, pour qu'une reconnexion se rejoue à l'identique.
        for convId in open.sorted() where convId != active && joined.contains(convId) {
            rooms.append(convId)
        }
        for convId in joined where convId != active && !open.contains(convId) {
            rooms.append(convId)
        }
        return rooms
    }
}
