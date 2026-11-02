import Foundation

/// **La loi de REPRISE d'un fichier qui se remplit en tête (#11288)** — PURE.
///
/// Un transfert en flux part du premier octet, ou reprend une tête déjà écrite
/// (`bytes=<n>-`). Ce qu'il accepte en réponse en dépend : une réponse qui ne
/// commence pas EXACTEMENT là où le fichier s'est arrêté ne s'écrit jamais à sa
/// suite, sans quoi le cache adopterait une vidéo corrompue.
///
/// - Départ du début : `206` (la tête demandée, le total lu dans
///   `Content-Range`, reprise possible) ou tout autre `2xx` (le fichier entier ;
///   un serveur qui ignore `Range` le rend ainsi, et rien ne se reprend).
/// - Reprise : `206` dont la plage commence à l'octet attendu, et rien d'autre.
public enum ProgressiveResumeLaw {

    public struct Acceptance: Sendable, Equatable {
        /// La taille du FICHIER entier, quand la réponse la dit.
        public let totalBytes: Int64?
        /// Le serveur sert par plage : une tête interrompue se reprend.
        public let resumable: Bool

        public init(totalBytes: Int64?, resumable: Bool) {
            self.totalBytes = totalBytes
            self.resumable = resumable
        }
    }

    /// Une reprise à laquelle le serveur a répondu par autre chose que la suite
    /// attendue : rien n'a été écrit derrière la tête.
    public struct RangeNotHonoredError: Error, Equatable {
        public init() {}
    }

    /// L'en-tête `Range` d'un transfert qui part de `offset` : `length` octets,
    /// ou jusqu'au bout. `nil` pour un transfert entier, qui n'en porte pas.
    public static func rangeHeader(from offset: Int64, length: Int?) -> String? {
        if let length { return "bytes=\(offset)-\(offset + Int64(max(1, length)) - 1)" }
        return offset > 0 ? "bytes=\(offset)-" : nil
    }

    /// `statusCode` : `nil` hors HTTP (fichier, données). `contentLength` : celui
    /// de la réponse, `-1` s'il est inconnu. `nil` ⇒ la réponse est REFUSÉE.
    public static func acceptance(
        statusCode: Int?,
        contentRange: String?,
        contentLength: Int64,
        resumingAt offset: Int64
    ) -> Acceptance? {
        let length = contentLength > 0 ? contentLength : nil
        guard let statusCode else {
            return offset == 0 ? Acceptance(totalBytes: length, resumable: false) : nil
        }
        guard (200...299).contains(statusCode) else { return nil }
        guard statusCode == 206 else {
            return offset == 0 ? Acceptance(totalBytes: length, resumable: false) : nil
        }
        guard let range = contentRange.flatMap(parse), range.start == offset else { return nil }
        return Acceptance(totalBytes: range.total, resumable: true)
    }

    /// La même décision, lue sur une réponse réelle.
    public static func acceptance(of response: URLResponse, resumingAt offset: Int64) -> Acceptance? {
        let http = response as? HTTPURLResponse
        return acceptance(
            statusCode: http?.statusCode,
            contentRange: http?.value(forHTTPHeaderField: "Content-Range"),
            contentLength: response.expectedContentLength,
            resumingAt: offset
        )
    }

    /// `bytes <début>-<fin>/<total|*>`.
    private static func parse(_ header: String) -> (start: Int64, total: Int64?)? {
        let trimmed = header.trimmingCharacters(in: .whitespaces)
        guard trimmed.lowercased().hasPrefix("bytes ") else { return nil }
        let spec = trimmed.dropFirst("bytes ".count)
        let halves = spec.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
        guard halves.count == 2 else { return nil }
        let bounds = halves[0].split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        guard bounds.count == 2, let start = Int64(bounds[0]), Int64(bounds[1]) != nil else { return nil }
        let total = halves[1] == "*" ? nil : Int64(halves[1])
        guard halves[1] == "*" || total != nil else { return nil }
        return (start, total)
    }
}
