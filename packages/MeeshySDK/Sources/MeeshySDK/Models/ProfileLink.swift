import Foundation

/// L'adresse courte d'une fiche (#18862) : `https://meeshy.me/@pseudo`, que le web sert (`/@$username`)
/// et que la page publique — la Vitrine au cercle Public — affiche. Un pseudo vide n'a pas d'adresse.
public struct ProfileLink: Sendable, Equatable {
    public static let host = "meeshy.me"

    public let username: String
    public let url: URL

    public init?(username: String?) {
        let trimmed = (username ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let handle = trimmed.hasPrefix("@") ? String(trimmed.dropFirst()) : trimmed
        guard !handle.isEmpty,
              let encoded = handle.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "https://\(Self.host)/@\(encoded)") else { return nil }
        self.username = handle
        self.url = url
    }

    /// L'adresse telle qu'on la lit, sans schéma.
    public var displayText: String {
        "\(Self.host)/@\(username)"
    }
}
